
ALTER TABLE public.subscription_payments
  ADD COLUMN IF NOT EXISTS callback_processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS callback_ip text,
  ADD COLUMN IF NOT EXISTS callback_user_agent text,
  ADD COLUMN IF NOT EXISTS callback_nonce text,
  ADD COLUMN IF NOT EXISTS gateway_error text,
  ADD COLUMN IF NOT EXISTS gateway_retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_renewal_attempted_at timestamptz;

DROP INDEX IF EXISTS public.subscription_payments_gw_payment_id_uniq;
DROP INDEX IF EXISTS public.subscription_payments_gw_txn_id_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS subscription_payments_gw_payment_uniq
  ON public.subscription_payments (gateway, gateway_payment_id)
  WHERE gateway_payment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS subscription_payments_gw_txn_uniq
  ON public.subscription_payments (gateway, gateway_transaction_id)
  WHERE gateway_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS subscription_payments_processing_idx
  ON public.subscription_payments (created_at)
  WHERE payment_status = 'processing' AND processed_at IS NULL;

CREATE INDEX IF NOT EXISTS subscriptions_grace_idx
  ON public.subscriptions (grace_until)
  WHERE status = 'past_due';

CREATE OR REPLACE FUNCTION public.write_billing_event(
  _tenant_id uuid, _subscription_id uuid, _event_type text, _payload jsonb,
  _amount numeric DEFAULT NULL, _currency text DEFAULT NULL,
  _status text DEFAULT NULL, _event_id text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_id uuid;
BEGIN
  IF _tenant_id IS NULL THEN RETURN NULL; END IF;
  INSERT INTO public.billing_events
    (tenant_id, subscription_id, provider, event_type, event_id, amount, currency, status, payload, processed_at)
  VALUES
    (_tenant_id, _subscription_id, 'bkash', _event_type, _event_id, _amount, _currency, _status, COALESCE(_payload, '{}'::jsonb), now())
  ON CONFLICT (provider, event_id) WHERE event_id IS NOT NULL DO NOTHING
  RETURNING id INTO new_id;
  RETURN new_id;
END; $$;
REVOKE ALL ON FUNCTION public.write_billing_event(uuid,uuid,text,jsonb,numeric,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.write_billing_event(uuid,uuid,text,jsonb,numeric,text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.activate_subscription_from_payment(_payment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pay record; sub record; new_expires timestamptz; cycle_interval interval;
  result_action text; prev_status text;
BEGIN
  SELECT * INTO pay FROM public.subscription_payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'payment_not_found'); END IF;
  IF pay.processed_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'code', 'already_processed', 'subscription_id', pay.subscription_id);
  END IF;
  IF COALESCE(pay.payment_status, pay.status) NOT IN ('paid','success') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'payment_not_paid');
  END IF;
  cycle_interval := CASE WHEN pay.billing_cycle = 'yearly' THEN interval '1 year' ELSE interval '1 month' END;
  SELECT * INTO sub FROM public.subscriptions WHERE tenant_id = pay.tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    new_expires := now() + cycle_interval;
    INSERT INTO public.subscriptions (tenant_id, plan_id, billing_cycle, status, started_at, expires_at, last_payment_at)
    VALUES (pay.tenant_id, pay.plan_id, pay.billing_cycle, 'active', now(), new_expires, now())
    RETURNING * INTO sub;
    result_action := 'created';
  ELSE
    prev_status := sub.status;
    IF sub.expires_at IS NOT NULL AND sub.expires_at > now() THEN
      new_expires := sub.expires_at + cycle_interval;
    ELSE
      new_expires := now() + cycle_interval;
    END IF;
    UPDATE public.subscriptions
       SET plan_id = COALESCE(pay.plan_id, sub.plan_id),
           billing_cycle = pay.billing_cycle, status = 'active',
           expires_at = new_expires, grace_until = NULL, grace_period_ends_at = NULL,
           last_payment_at = now(), updated_at = now()
     WHERE id = sub.id RETURNING * INTO sub;
    result_action := CASE WHEN prev_status IN ('expired','past_due') THEN 'reactivated' ELSE 'renewed' END;
  END IF;

  UPDATE public.subscription_payments
     SET subscription_id = sub.id, status = 'approved', payment_status = 'paid',
         processed_at = now(), reviewed_at = COALESCE(reviewed_at, now()), updated_at = now()
   WHERE id = pay.id;

  INSERT INTO public.audit_log (tenant_id, user_id, action, entity_table, entity_id, after_data, created_at)
  VALUES (pay.tenant_id, pay.submitted_by, 'subscription_' || result_action,
          'subscription_payments', pay.id,
          jsonb_build_object('gateway', pay.gateway, 'gateway_payment_id', pay.gateway_payment_id,
            'gateway_transaction_id', pay.gateway_transaction_id, 'amount', pay.amount,
            'plan_id', pay.plan_id, 'expires_at', new_expires, 'subscription_id', sub.id), now());

  PERFORM public.write_billing_event(pay.tenant_id, sub.id, 'subscription_' || result_action,
    jsonb_build_object('payment_id', pay.id, 'gateway', pay.gateway,
      'gateway_payment_id', pay.gateway_payment_id, 'gateway_transaction_id', pay.gateway_transaction_id,
      'plan_id', pay.plan_id, 'expires_at', new_expires),
    pay.amount, pay.currency, 'paid', 'activation:' || pay.id::text);

  RETURN jsonb_build_object('ok', true, 'code', result_action, 'subscription_id', sub.id, 'expires_at', new_expires);
END; $$;

CREATE OR REPLACE FUNCTION public.process_subscription_expiry()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; cnt integer := 0;
BEGIN
  FOR r IN SELECT id, tenant_id FROM public.subscriptions
           WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= now()
           FOR UPDATE SKIP LOCKED LOOP
    UPDATE public.subscriptions
       SET status = 'past_due',
           grace_until = COALESCE(grace_until, now() + interval '7 days'),
           grace_period_ends_at = COALESCE(grace_period_ends_at, now() + interval '7 days'),
           updated_at = now()
     WHERE id = r.id;
    PERFORM public.write_billing_event(r.tenant_id, r.id, 'subscription_grace_started',
      jsonb_build_object('grace_until', now() + interval '7 days'),
      NULL, NULL, 'past_due', 'grace:' || r.id::text || ':' || to_char(now(),'YYYYMMDD'));
    INSERT INTO public.audit_log (tenant_id, action, entity_table, entity_id, after_data, created_at)
    VALUES (r.tenant_id, 'subscription_grace_started', 'subscriptions', r.id,
            jsonb_build_object('grace_until', now() + interval '7 days'), now());
    cnt := cnt + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'moved_to_grace', cnt);
END; $$;

CREATE OR REPLACE FUNCTION public.process_subscription_grace_period()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; cnt integer := 0;
BEGIN
  FOR r IN SELECT id, tenant_id FROM public.subscriptions
           WHERE status = 'past_due'
             AND COALESCE(grace_until, grace_period_ends_at) IS NOT NULL
             AND COALESCE(grace_until, grace_period_ends_at) <= now()
           FOR UPDATE SKIP LOCKED LOOP
    UPDATE public.subscriptions SET status = 'expired', updated_at = now() WHERE id = r.id;
    UPDATE public.tenants SET status = 'suspended', updated_at = now()
     WHERE id = r.tenant_id AND status IS DISTINCT FROM 'suspended';
    PERFORM public.write_billing_event(r.tenant_id, r.id, 'subscription_expired',
      jsonb_build_object('expired_at', now()), NULL, NULL, 'expired',
      'expired:' || r.id::text || ':' || to_char(now(),'YYYYMMDD'));
    INSERT INTO public.audit_log (tenant_id, action, entity_table, entity_id, after_data, created_at)
    VALUES (r.tenant_id, 'subscription_expired', 'subscriptions', r.id,
            jsonb_build_object('expired_at', now()), now());
    cnt := cnt + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'expired', cnt);
END; $$;

CREATE OR REPLACE FUNCTION public.process_subscription_reactivation()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; cnt integer := 0;
BEGIN
  FOR r IN SELECT s.id, s.tenant_id FROM public.subscriptions s
           JOIN public.tenants t ON t.id = s.tenant_id
           WHERE s.status = 'active' AND s.expires_at > now() AND t.status = 'suspended'
           FOR UPDATE OF t SKIP LOCKED LOOP
    UPDATE public.tenants SET status = 'active', updated_at = now() WHERE id = r.tenant_id;
    PERFORM public.write_billing_event(r.tenant_id, r.id, 'subscription_reactivated',
      jsonb_build_object('reactivated_at', now()), NULL, NULL, 'active',
      'reactivated:' || r.id::text || ':' || to_char(now(),'YYYYMMDDHH24'));
    INSERT INTO public.audit_log (tenant_id, action, entity_table, entity_id, after_data, created_at)
    VALUES (r.tenant_id, 'subscription_reactivated', 'subscriptions', r.id,
            jsonb_build_object('reactivated_at', now()), now());
    cnt := cnt + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'reactivated', cnt);
END; $$;

CREATE OR REPLACE FUNCTION public.queue_expiry_warnings()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; days_left integer; thr integer; cnt integer := 0; warning_key text;
BEGIN
  FOR r IN SELECT s.id, s.tenant_id, s.expires_at, s.plan_id FROM public.subscriptions s
           WHERE s.status = 'active' AND s.expires_at IS NOT NULL
             AND s.expires_at BETWEEN now() AND now() + interval '31 days' LOOP
    days_left := EXTRACT(EPOCH FROM (r.expires_at - now()))::int / 86400;
    FOREACH thr IN ARRAY ARRAY[30,15,7,3,1] LOOP
      IF days_left = thr THEN
        warning_key := 'expiry_warning:' || r.id::text || ':' || thr::text;
        IF NOT EXISTS (SELECT 1 FROM public.notifications
            WHERE tenant_id = r.tenant_id AND entity_type = 'subscription'
              AND entity_id = r.id AND (data->>'warning_key') = warning_key) THEN
          INSERT INTO public.notifications
            (tenant_id, type, title, body, severity, entity_type, entity_id, data)
          VALUES (r.tenant_id, 'subscription_expiring',
            'Subscription expiring in ' || thr || ' day' || CASE WHEN thr=1 THEN '' ELSE 's' END,
            'Your subscription will expire on ' || to_char(r.expires_at, 'YYYY-MM-DD') || '. Please renew to avoid service interruption.',
            CASE WHEN thr <= 3 THEN 'critical' WHEN thr <= 7 THEN 'warning' ELSE 'info' END,
            'subscription', r.id,
            jsonb_build_object('warning_key', warning_key, 'days_left', thr, 'expires_at', r.expires_at));
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

CREATE OR REPLACE FUNCTION public.attempt_auto_renewal()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; cnt integer := 0; renew_key text;
BEGIN
  FOR r IN SELECT id, tenant_id, expires_at, plan_id FROM public.subscriptions
           WHERE auto_renew = true AND status = 'active'
             AND expires_at BETWEEN now() AND now() + interval '2 days' LOOP
    renew_key := 'auto_renew:' || r.id::text || ':' || to_char(r.expires_at,'YYYYMMDD');
    IF NOT EXISTS (SELECT 1 FROM public.notifications
        WHERE tenant_id = r.tenant_id AND entity_type = 'subscription'
          AND entity_id = r.id AND (data->>'auto_renew_key') = renew_key) THEN
      INSERT INTO public.notifications
        (tenant_id, type, title, body, severity, entity_type, entity_id, data)
      VALUES (r.tenant_id, 'auto_renew_required',
        'Action required: complete your subscription renewal',
        'Auto-renewal is enabled but no stored payment method is available. Please complete payment to renew automatically.',
        'warning', 'subscription', r.id,
        jsonb_build_object('auto_renew_key', renew_key, 'plan_id', r.plan_id, 'expires_at', r.expires_at));
      UPDATE public.subscriptions SET auto_renewal_attempted_at = now() WHERE id = r.id;
      cnt := cnt + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'notified', cnt);
END; $$;

REVOKE ALL ON FUNCTION public.process_subscription_expiry() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_subscription_grace_period() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_subscription_reactivation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.queue_expiry_warnings() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attempt_auto_renewal() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_subscription_expiry() TO service_role;
GRANT EXECUTE ON FUNCTION public.process_subscription_grace_period() TO service_role;
GRANT EXECUTE ON FUNCTION public.process_subscription_reactivation() TO service_role;
GRANT EXECUTE ON FUNCTION public.queue_expiry_warnings() TO service_role;
GRANT EXECUTE ON FUNCTION public.attempt_auto_renewal() TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
DECLARE j text;
BEGIN
  FOREACH j IN ARRAY ARRAY['subs-expiry-daily','subs-grace-daily','subs-reactivation-hourly','subs-expiry-warnings-daily','subs-auto-renew-daily'] LOOP
    BEGIN PERFORM cron.unschedule(j); EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;
END $$;

SELECT cron.schedule('subs-expiry-daily',          '5 0 * * *',  $$SELECT public.process_subscription_expiry();$$);
SELECT cron.schedule('subs-grace-daily',           '15 0 * * *', $$SELECT public.process_subscription_grace_period();$$);
SELECT cron.schedule('subs-reactivation-hourly',   '0 * * * *',  $$SELECT public.process_subscription_reactivation();$$);
SELECT cron.schedule('subs-expiry-warnings-daily', '30 8 * * *', $$SELECT public.queue_expiry_warnings();$$);
SELECT cron.schedule('subs-auto-renew-daily',      '45 8 * * *', $$SELECT public.attempt_auto_renewal();$$);
