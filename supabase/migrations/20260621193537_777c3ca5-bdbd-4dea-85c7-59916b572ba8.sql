
-- Phase 2.1 hardening

-- FIX 3: Auto trial subscription on tenant insert (15 days)
CREATE OR REPLACE FUNCTION public.auto_trial_on_tenant_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_plan_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.subscriptions WHERE tenant_id = NEW.id) THEN
    RETURN NEW;
  END IF;
  SELECT id INTO v_plan_id FROM public.plans
    WHERE is_active = true
    ORDER BY COALESCE(sort_order, 999), price_bdt NULLS LAST
    LIMIT 1;
  IF v_plan_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.subscriptions (tenant_id, plan_id, status, billing_cycle, starts_at, expires_at, grace_until, auto_renew)
  VALUES (NEW.id, v_plan_id, 'trial', 'monthly', now(), now() + interval '15 days', now() + interval '15 days', false);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_auto_trial_on_tenant ON public.tenants;
CREATE TRIGGER trg_auto_trial_on_tenant AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.auto_trial_on_tenant_insert();

-- FIX 6: Payment audit trail
CREATE OR REPLACE FUNCTION public.audit_payment_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid;
BEGIN
  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (tenant_id, user_id, entity_type, entity_id, action, new_value)
    VALUES (v_tenant, auth.uid(), 'payment_transactions', NEW.id, 'created',
            jsonb_build_object('status', NEW.status, 'amount', NEW.amount, 'provider', NEW.provider));
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.audit_log (tenant_id, user_id, entity_type, entity_id, action, old_value, new_value)
    VALUES (v_tenant, auth.uid(), 'payment_transactions', NEW.id, 'status_change',
            jsonb_build_object('status', OLD.status),
            jsonb_build_object('status', NEW.status));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_audit_payment ON public.payment_transactions;
CREATE TRIGGER trg_audit_payment AFTER INSERT OR UPDATE OF status ON public.payment_transactions
  FOR EACH ROW EXECUTE FUNCTION public.audit_payment_changes();

-- FIX 7: SMS retry policy
ALTER TABLE public.sms_queue
  ADD COLUMN IF NOT EXISTS max_attempts int NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_sms_queue_retry ON public.sms_queue (status, next_retry_at) WHERE status = 'pending';

-- FIX 8: Friendly plan-limit errors (JSON payload in MESSAGE)
CREATE OR REPLACE FUNCTION public.enforce_plan_limit_branch() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_limit int;
BEGIN
  IF NOT public.check_plan_limit(NEW.tenant_id, 'branch') THEN
    SELECT p.max_branches INTO v_limit FROM public.subscriptions s JOIN public.plans p ON p.id=s.plan_id
      WHERE s.tenant_id=NEW.tenant_id ORDER BY s.created_at DESC LIMIT 1;
    RAISE EXCEPTION '{"code":"plan_limit_exceeded","resource":"branches","limit":%}', COALESCE(v_limit,0) USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.enforce_plan_limit_warehouse() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_limit int;
BEGIN
  IF NOT public.check_plan_limit(NEW.tenant_id, 'warehouse') THEN
    SELECT p.max_warehouses INTO v_limit FROM public.subscriptions s JOIN public.plans p ON p.id=s.plan_id
      WHERE s.tenant_id=NEW.tenant_id ORDER BY s.created_at DESC LIMIT 1;
    RAISE EXCEPTION '{"code":"plan_limit_exceeded","resource":"warehouses","limit":%}', COALESCE(v_limit,0) USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.enforce_plan_limit_user() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_limit int;
BEGIN
  IF NOT public.check_plan_limit(NEW.tenant_id, 'user') THEN
    SELECT p.max_users INTO v_limit FROM public.subscriptions s JOIN public.plans p ON p.id=s.plan_id
      WHERE s.tenant_id=NEW.tenant_id ORDER BY s.created_at DESC LIMIT 1;
    RAISE EXCEPTION '{"code":"plan_limit_exceeded","resource":"users","limit":%}', COALESCE(v_limit,0) USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END $$;

-- FIX 5: Renew + Downgrade RPCs (bypass subscription_guard via SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.renew_subscription(_tenant uuid, _months int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller uuid;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL OR NOT public.is_app_admin(v_caller) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
  END IF;
  IF _months IS NULL OR _months < 1 OR _months > 36 THEN
    RAISE EXCEPTION 'Invalid months' USING ERRCODE='22023';
  END IF;
  UPDATE public.subscriptions
    SET expires_at = GREATEST(COALESCE(expires_at, now()), now()) + make_interval(months => _months),
        grace_until = GREATEST(COALESCE(expires_at, now()), now()) + make_interval(months => _months) + interval '7 days',
        status = 'active',
        updated_at = now()
    WHERE tenant_id = _tenant;
END $$;

CREATE OR REPLACE FUNCTION public.downgrade_plan(_tenant uuid, _plan uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller uuid; v_max_b int; v_max_w int; v_max_u int; v_unlimited boolean;
        v_cnt_b int; v_cnt_w int; v_cnt_u int;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL OR NOT public.is_app_admin(v_caller) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
  END IF;
  SELECT is_unlimited, max_branches, max_warehouses, max_users
    INTO v_unlimited, v_max_b, v_max_w, v_max_u
    FROM public.plans WHERE id = _plan;
  IF NOT COALESCE(v_unlimited, false) THEN
    SELECT count(*) INTO v_cnt_b FROM public.branches WHERE tenant_id=_tenant AND deleted_at IS NULL;
    SELECT count(*) INTO v_cnt_w FROM public.warehouses WHERE tenant_id=_tenant AND deleted_at IS NULL;
    SELECT count(*) INTO v_cnt_u FROM public.tenant_members WHERE tenant_id=_tenant;
    IF v_max_b IS NOT NULL AND v_cnt_b > v_max_b THEN
      RAISE EXCEPTION '{"code":"downgrade_blocked","resource":"branches","current":%,"limit":%}', v_cnt_b, v_max_b USING ERRCODE='P0001';
    END IF;
    IF v_max_w IS NOT NULL AND v_cnt_w > v_max_w THEN
      RAISE EXCEPTION '{"code":"downgrade_blocked","resource":"warehouses","current":%,"limit":%}', v_cnt_w, v_max_w USING ERRCODE='P0001';
    END IF;
    IF v_max_u IS NOT NULL AND v_cnt_u > v_max_u THEN
      RAISE EXCEPTION '{"code":"downgrade_blocked","resource":"users","current":%,"limit":%}', v_cnt_u, v_max_u USING ERRCODE='P0001';
    END IF;
  END IF;
  UPDATE public.subscriptions SET plan_id = _plan, updated_at = now() WHERE tenant_id = _tenant;
END $$;

GRANT EXECUTE ON FUNCTION public.renew_subscription(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.downgrade_plan(uuid, uuid) TO authenticated;

-- Backfill: ensure every existing tenant has a subscription
INSERT INTO public.subscriptions (tenant_id, plan_id, status, billing_cycle, starts_at, expires_at, grace_until, auto_renew)
SELECT t.id,
       (SELECT id FROM public.plans WHERE is_active=true ORDER BY COALESCE(sort_order,999), price_bdt NULLS LAST LIMIT 1),
       'trial', 'monthly', now(), now() + interval '15 days', now() + interval '15 days', false
FROM public.tenants t
WHERE NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.tenant_id = t.id)
  AND EXISTS (SELECT 1 FROM public.plans WHERE is_active=true);
