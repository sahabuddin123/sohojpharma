
CREATE OR REPLACE FUNCTION public.activate_subscription_from_payment(_payment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pay record;
  sub record;
  new_expires timestamptz;
  cycle_interval interval;
  result_action text;
  prev_status text;
BEGIN
  SELECT * INTO pay FROM public.subscription_payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'payment_not_found');
  END IF;

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
    INSERT INTO public.subscriptions (tenant_id, plan_id, billing_cycle, status, started_at, expires_at)
    VALUES (pay.tenant_id, pay.plan_id, pay.billing_cycle, 'active', now(), new_expires)
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
           billing_cycle = pay.billing_cycle,
           status = 'active',
           expires_at = new_expires,
           grace_until = NULL,
           updated_at = now()
     WHERE id = sub.id
     RETURNING * INTO sub;
    result_action := CASE WHEN prev_status = 'expired' THEN 'reactivated' ELSE 'renewed' END;
  END IF;

  UPDATE public.subscription_payments
     SET subscription_id = sub.id,
         status = 'approved',
         payment_status = 'paid',
         processed_at = now(),
         reviewed_at = COALESCE(reviewed_at, now()),
         updated_at = now()
   WHERE id = pay.id;

  INSERT INTO public.audit_log (tenant_id, user_id, action, entity_table, entity_id, after_data, created_at)
  VALUES (
    pay.tenant_id,
    pay.submitted_by,
    'subscription_' || result_action,
    'subscription_payments',
    pay.id,
    jsonb_build_object(
      'gateway', pay.gateway,
      'gateway_payment_id', pay.gateway_payment_id,
      'gateway_transaction_id', pay.gateway_transaction_id,
      'amount', pay.amount,
      'plan_id', pay.plan_id,
      'expires_at', new_expires,
      'subscription_id', sub.id
    ),
    now()
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', result_action,
    'subscription_id', sub.id,
    'expires_at', new_expires
  );
END;
$$;
