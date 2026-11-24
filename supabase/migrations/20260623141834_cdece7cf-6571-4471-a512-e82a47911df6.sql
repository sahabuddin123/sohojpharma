
-- 1) Expiry: active -> grace_period, set grace_until = +7 days
CREATE OR REPLACE FUNCTION public.process_subscription_expiry()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; cnt integer := 0;
BEGIN
  FOR r IN SELECT id, tenant_id FROM public.subscriptions
           WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= now()
           FOR UPDATE SKIP LOCKED LOOP
    UPDATE public.subscriptions
       SET status = 'grace_period',
           grace_until = COALESCE(grace_until, now() + interval '7 days'),
           grace_period_ends_at = COALESCE(grace_period_ends_at, now() + interval '7 days'),
           updated_at = now()
     WHERE id = r.id;
    PERFORM public.write_billing_event(r.tenant_id, r.id, 'subscription_grace_started',
      jsonb_build_object('grace_until', now() + interval '7 days'),
      NULL, NULL, 'grace_period', 'grace:' || r.id::text || ':' || to_char(now(),'YYYYMMDD'));
    INSERT INTO public.notifications (tenant_id, type, title, body, severity, entity_type, entity_id, data)
    VALUES (r.tenant_id, 'subscription_grace_started',
      'Subscription expired — grace period started',
      'Your subscription has expired. You have 7 days of grace period to renew before the store is suspended.',
      'critical', 'subscription', r.id,
      jsonb_build_object('grace_until', now() + interval '7 days'));
    cnt := cnt + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'moved_to_grace', cnt);
END; $$;

-- 2) Grace period end: grace_period -> suspended (was: expired)
CREATE OR REPLACE FUNCTION public.process_subscription_grace_period()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; cnt integer := 0;
BEGIN
  FOR r IN SELECT id, tenant_id FROM public.subscriptions
           WHERE status IN ('grace_period','past_due')
             AND COALESCE(grace_until, grace_period_ends_at) IS NOT NULL
             AND COALESCE(grace_until, grace_period_ends_at) <= now()
           FOR UPDATE SKIP LOCKED LOOP
    UPDATE public.subscriptions SET status = 'suspended', updated_at = now() WHERE id = r.id;
    UPDATE public.tenants SET status = 'suspended', updated_at = now()
     WHERE id = r.tenant_id AND status IS DISTINCT FROM 'suspended';
    PERFORM public.write_billing_event(r.tenant_id, r.id, 'subscription_suspended',
      jsonb_build_object('suspended_at', now()), NULL, NULL, 'suspended',
      'suspended:' || r.id::text || ':' || to_char(now(),'YYYYMMDD'));
    INSERT INTO public.notifications (tenant_id, type, title, body, severity, entity_type, entity_id, data)
    VALUES (r.tenant_id, 'subscription_suspended',
      'Store suspended — subscription unpaid',
      'Your grace period has ended. The store has been suspended. Please renew to restore access.',
      'critical', 'subscription', r.id,
      jsonb_build_object('suspended_at', now()));
    cnt := cnt + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'suspended', cnt);
END; $$;

-- 3) Reminders at 7 / 3 / 1 / 0 days before expiry
CREATE OR REPLACE FUNCTION public.queue_expiry_warnings()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; days_left integer; thr integer; cnt integer := 0; warning_key text;
BEGIN
  FOR r IN SELECT s.id, s.tenant_id, s.expires_at, s.plan_id FROM public.subscriptions s
           WHERE s.status = 'active' AND s.expires_at IS NOT NULL
             AND s.expires_at BETWEEN now() AND now() + interval '8 days' LOOP
    days_left := GREATEST(0, EXTRACT(EPOCH FROM (r.expires_at - now()))::int / 86400);
    FOREACH thr IN ARRAY ARRAY[7,3,1,0] LOOP
      IF days_left = thr THEN
        warning_key := 'expiry_warning:' || r.id::text || ':' || thr::text;
        IF NOT EXISTS (SELECT 1 FROM public.notifications
            WHERE tenant_id = r.tenant_id AND entity_type = 'subscription'
              AND entity_id = r.id AND (data->>'warning_key') = warning_key) THEN
          INSERT INTO public.notifications
            (tenant_id, type, title, body, severity, entity_type, entity_id, data)
          VALUES (r.tenant_id, 'subscription_expiring',
            CASE WHEN thr = 0 THEN 'Subscription expires today'
                 ELSE 'Subscription expiring in ' || thr || ' day' || CASE WHEN thr=1 THEN '' ELSE 's' END END,
            'Your subscription will expire on ' || to_char(r.expires_at, 'YYYY-MM-DD') || '. Please renew to avoid service interruption.',
            CASE WHEN thr <= 1 THEN 'critical' WHEN thr <= 3 THEN 'warning' ELSE 'info' END,
            'subscription', r.id,
            jsonb_build_object('warning_key', warning_key, 'days_left', thr, 'expires_at', r.expires_at,
                               'channels', jsonb_build_array('in_app','email','sms')));
          PERFORM public.write_billing_event(r.tenant_id, r.id, 'subscription_expiring',
            jsonb_build_object('days_left', thr, 'expires_at', r.expires_at),
            NULL, NULL, 'active', warning_key);
          cnt := cnt + 1;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'queued', cnt);
END; $$;

REVOKE ALL ON FUNCTION public.process_subscription_expiry() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_subscription_grace_period() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.queue_expiry_warnings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_subscription_expiry() TO service_role;
GRANT EXECUTE ON FUNCTION public.process_subscription_grace_period() TO service_role;
GRANT EXECUTE ON FUNCTION public.queue_expiry_warnings() TO service_role;

-- 4) Admin widget counts
CREATE OR REPLACE FUNCTION public.admin_expiry_widgets()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_app_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'expiring_today', (
      SELECT count(*) FROM public.subscriptions
      WHERE status = 'active' AND expires_at IS NOT NULL
        AND expires_at::date = (now())::date),
    'expiring_this_week', (
      SELECT count(*) FROM public.subscriptions
      WHERE status = 'active' AND expires_at IS NOT NULL
        AND expires_at BETWEEN now() AND now() + interval '7 days'),
    'in_grace_period', (
      SELECT count(*) FROM public.subscriptions
      WHERE status IN ('grace_period','past_due')),
    'suspended_stores', (
      SELECT count(*) FROM public.subscriptions
      WHERE status = 'suspended')
  ) INTO result;
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.admin_expiry_widgets() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_expiry_widgets() TO authenticated;

-- 5) Reschedule cron — daily processors + reminders
DO $$
DECLARE j text;
BEGIN
  FOREACH j IN ARRAY ARRAY['subs-expiry-daily','subs-grace-daily','subs-expiry-warnings-daily'] LOOP
    BEGIN PERFORM cron.unschedule(j); EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;
END $$;

SELECT cron.schedule('subs-expiry-warnings-daily', '0 8 * * *',  $$SELECT public.queue_expiry_warnings();$$);
SELECT cron.schedule('subs-expiry-daily',          '5 0 * * *',  $$SELECT public.process_subscription_expiry();$$);
SELECT cron.schedule('subs-grace-daily',           '15 0 * * *', $$SELECT public.process_subscription_grace_period();$$);
