
DROP FUNCTION IF EXISTS public.admin_change_plan(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.admin_change_plan(uuid, uuid, text, text, boolean);

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS scheduled_plan_id  uuid REFERENCES public.plans(id),
  ADD COLUMN IF NOT EXISTS scheduled_cycle    text,
  ADD COLUMN IF NOT EXISTS scheduled_change_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_subs_scheduled_change
  ON public.subscriptions(scheduled_change_at)
  WHERE scheduled_plan_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.admin_change_plan(
  p_subscription uuid, p_new_plan uuid, p_cycle text,
  p_mode text DEFAULT 'auto', p_waive_fees boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub public.subscriptions%ROWTYPE;
  v_cur_price numeric(14,2); v_new_price numeric(14,2);
  v_total_days integer; v_remaining integer;
  v_credit numeric(14,2) := 0; v_charge numeric(14,2) := 0;
  v_action text; v_payment_id uuid;
BEGIN
  IF NOT public.is_app_admin(auth.uid()) THEN RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_sub FROM public.subscriptions WHERE id = p_subscription FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription_not_found'; END IF;

  SELECT net_price INTO v_cur_price FROM public.get_plan_pricing(v_sub.plan_id, v_sub.billing_cycle);
  SELECT net_price INTO v_new_price FROM public.get_plan_pricing(p_new_plan, p_cycle);
  v_cur_price := COALESCE(v_cur_price, 0);
  v_new_price := COALESCE(v_new_price, 0);

  IF p_mode = 'force_upgrade' THEN v_action := 'upgrade';
  ELSIF p_mode = 'force_downgrade' THEN v_action := 'downgrade';
  ELSIF v_new_price > v_cur_price THEN v_action := 'upgrade';
  ELSIF v_new_price < v_cur_price THEN v_action := 'downgrade';
  ELSE v_action := 'upgrade'; END IF;

  IF v_action = 'downgrade' AND p_mode <> 'force_downgrade' THEN
    UPDATE public.subscriptions
       SET scheduled_plan_id = p_new_plan, scheduled_cycle = p_cycle,
           scheduled_change_at = COALESCE(current_period_end, expires_at), updated_at = now()
     WHERE id = p_subscription;
    INSERT INTO public.audit_log (tenant_id, action, entity_table, entity_id, after_data, created_at)
    VALUES (v_sub.tenant_id, 'subscription_downgrade_scheduled', 'subscriptions', p_subscription,
            jsonb_build_object('scheduled_plan_id', p_new_plan, 'scheduled_cycle', p_cycle,
                               'effective_at', COALESCE(v_sub.current_period_end, v_sub.expires_at),
                               'current_price', v_cur_price, 'new_price', v_new_price), now());
    INSERT INTO public.subscription_history
      (subscription_id, tenant_id, event_type, from_status, to_status, from_plan_id, to_plan_id, metadata, created_at)
    VALUES (p_subscription, v_sub.tenant_id, 'downgrade_scheduled', v_sub.status, v_sub.status,
            v_sub.plan_id, p_new_plan,
            jsonb_build_object('cycle', p_cycle, 'effective_at', COALESCE(v_sub.current_period_end, v_sub.expires_at),
                               'current_price', v_cur_price, 'new_price', v_new_price), now());
    RETURN jsonb_build_object('ok', true, 'action', 'downgrade_scheduled',
      'effective_at', COALESCE(v_sub.current_period_end, v_sub.expires_at),
      'current_price', v_cur_price, 'new_price', v_new_price);
  END IF;

  v_total_days := GREATEST(1,
    EXTRACT(EPOCH FROM (COALESCE(v_sub.current_period_end, v_sub.expires_at)
                       - COALESCE(v_sub.current_period_start, v_sub.starts_at)))::int / 86400);
  v_remaining := GREATEST(0,
    EXTRACT(EPOCH FROM (COALESCE(v_sub.current_period_end, v_sub.expires_at) - now()))::int / 86400);

  v_credit := ROUND((v_remaining::numeric / v_total_days::numeric) * v_cur_price, 2);
  v_charge := GREATEST(0, ROUND(v_new_price - v_credit, 2));
  IF p_waive_fees THEN v_charge := 0; END IF;

  UPDATE public.subscriptions
     SET plan_id = p_new_plan, billing_cycle = p_cycle,
         scheduled_plan_id = NULL, scheduled_cycle = NULL, scheduled_change_at = NULL,
         updated_at = now()
   WHERE id = p_subscription;

  IF v_charge > 0 OR p_waive_fees THEN
    INSERT INTO public.subscription_payments
      (tenant_id, subscription_id, plan_id, billing_cycle, amount, currency, method, status, notes, reviewed_by, reviewed_at)
    VALUES (v_sub.tenant_id, p_subscription, p_new_plan, p_cycle, v_charge, 'BDT',
            CASE WHEN p_waive_fees THEN 'waived' ELSE 'admin_invoice' END,
            CASE WHEN p_waive_fees THEN 'waived' ELSE 'invoiced' END,
            'Plan ' || v_action || ': credit ' || v_credit || ', charge ' || v_charge,
            auth.uid(), now())
    RETURNING id INTO v_payment_id;
  END IF;

  INSERT INTO public.audit_log (tenant_id, action, entity_table, entity_id, after_data, created_at)
  VALUES (v_sub.tenant_id, 'subscription_' || v_action, 'subscriptions', p_subscription,
          jsonb_build_object('from_plan_id', v_sub.plan_id, 'to_plan_id', p_new_plan, 'cycle', p_cycle,
                             'current_price', v_cur_price, 'new_price', v_new_price,
                             'credit', v_credit, 'charge', v_charge, 'waived', p_waive_fees,
                             'payment_id', v_payment_id, 'mode', p_mode), now());

  INSERT INTO public.subscription_history
    (subscription_id, tenant_id, event_type, from_status, to_status, from_plan_id, to_plan_id, metadata, created_at)
  VALUES (p_subscription, v_sub.tenant_id, v_action, v_sub.status, v_sub.status,
          v_sub.plan_id, p_new_plan,
          jsonb_build_object('cycle', p_cycle, 'current_price', v_cur_price, 'new_price', v_new_price,
                             'credit', v_credit, 'charge', v_charge, 'waived', p_waive_fees,
                             'payment_id', v_payment_id, 'mode', p_mode), now());

  RETURN jsonb_build_object('ok', true, 'action', v_action,
    'credit', v_credit, 'charge', v_charge, 'waived', p_waive_fees,
    'current_price', v_cur_price, 'new_price', v_new_price, 'payment_id', v_payment_id);
END; $$;

REVOKE ALL ON FUNCTION public.admin_change_plan(uuid, uuid, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_change_plan(uuid, uuid, text, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_cancel_scheduled_change(p_subscription uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sub public.subscriptions%ROWTYPE;
BEGIN
  IF NOT public.is_app_admin(auth.uid()) THEN RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_sub FROM public.subscriptions WHERE id = p_subscription;
  IF NOT FOUND OR v_sub.scheduled_plan_id IS NULL THEN RETURN; END IF;
  UPDATE public.subscriptions
     SET scheduled_plan_id = NULL, scheduled_cycle = NULL, scheduled_change_at = NULL, updated_at = now()
   WHERE id = p_subscription;
  INSERT INTO public.audit_log (tenant_id, action, entity_table, entity_id, after_data, created_at)
  VALUES (v_sub.tenant_id, 'subscription_scheduled_change_cancelled', 'subscriptions', p_subscription,
          jsonb_build_object('cancelled_plan_id', v_sub.scheduled_plan_id, 'cancelled_cycle', v_sub.scheduled_cycle), now());
  INSERT INTO public.subscription_history
    (subscription_id, tenant_id, event_type, from_status, to_status, from_plan_id, to_plan_id, metadata, created_at)
  VALUES (p_subscription, v_sub.tenant_id, 'scheduled_change_cancelled', v_sub.status, v_sub.status,
          v_sub.plan_id, v_sub.scheduled_plan_id,
          jsonb_build_object('cancelled_cycle', v_sub.scheduled_cycle), now());
END; $$;
REVOKE ALL ON FUNCTION public.admin_cancel_scheduled_change(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_cancel_scheduled_change(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_renew_subscription(p_subscription uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sub public.subscriptions%ROWTYPE; v_cycle text; v_plan uuid; v_days integer; v_end timestamptz;
BEGIN
  IF NOT public.is_app_admin(auth.uid()) THEN RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_sub FROM public.subscriptions WHERE id = p_subscription FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription_not_found'; END IF;
  v_plan  := COALESCE(v_sub.scheduled_plan_id, v_sub.plan_id);
  v_cycle := COALESCE(v_sub.scheduled_cycle, v_sub.billing_cycle);
  v_end   := GREATEST(v_sub.current_period_end, now());
  SELECT duration_days INTO v_days FROM public.get_plan_pricing(v_plan, v_cycle);
  IF v_days IS NULL THEN v_days := public._cycle_months(v_cycle) * 30; END IF;

  UPDATE public.subscriptions
     SET plan_id = v_plan, billing_cycle = v_cycle,
         current_period_start = v_end,
         current_period_end   = v_end + (v_days || ' days')::interval,
         expires_at           = v_end + (v_days || ' days')::interval,
         scheduled_plan_id = NULL, scheduled_cycle = NULL, scheduled_change_at = NULL,
         status = 'active', cancelled_at = NULL, last_payment_at = now(), updated_at = now()
   WHERE id = p_subscription;

  IF v_sub.scheduled_plan_id IS NOT NULL AND v_sub.scheduled_plan_id <> v_sub.plan_id THEN
    INSERT INTO public.subscription_history
      (subscription_id, tenant_id, event_type, from_status, to_status, from_plan_id, to_plan_id, metadata, created_at)
    VALUES (p_subscription, v_sub.tenant_id, 'downgrade_applied', v_sub.status, 'active',
            v_sub.plan_id, v_sub.scheduled_plan_id,
            jsonb_build_object('cycle', v_cycle, 'applied_at', now()), now());
  END IF;
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_renew_subscription(uuid) TO authenticated;
