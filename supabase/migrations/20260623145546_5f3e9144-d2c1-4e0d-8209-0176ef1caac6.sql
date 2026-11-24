
-- S1
DROP POLICY IF EXISTS subs_owner_write ON public.subscriptions;
DROP POLICY IF EXISTS subs_tenant_select ON public.subscriptions;
DROP POLICY IF EXISTS subs_admin_all ON public.subscriptions;

CREATE POLICY subs_tenant_select
  ON public.subscriptions FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY subs_admin_all
  ON public.subscriptions FOR ALL TO authenticated
  USING (public.is_app_admin(auth.uid()))
  WITH CHECK (public.is_app_admin(auth.uid()));

-- S4
CREATE OR REPLACE FUNCTION public.validate_subscription_transition()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  old_s text; new_s text; allowed boolean := false; bypass boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('trial','active','grace_period') THEN
      RAISE EXCEPTION 'subscription cannot be created in status %', NEW.status USING ERRCODE='check_violation';
    END IF;
    RETURN NEW;
  END IF;

  old_s := OLD.status; new_s := NEW.status;
  IF old_s IS NOT DISTINCT FROM new_s THEN RETURN NEW; END IF;

  BEGIN bypass := COALESCE(current_setting('app.bypass_sub_transition', true)::boolean, false);
  EXCEPTION WHEN OTHERS THEN bypass := false; END;
  IF bypass THEN RETURN NEW; END IF;

  allowed := CASE
    WHEN old_s='trial'        AND new_s IN ('active','cancelled','expired') THEN true
    WHEN old_s='active'       AND new_s IN ('grace_period','suspended','cancelled','past_due','expired') THEN true
    WHEN old_s='grace_period' AND new_s IN ('active','expired','suspended') THEN true
    WHEN old_s='past_due'     AND new_s IN ('active','grace_period','expired','suspended') THEN true
    WHEN old_s='suspended'    AND new_s IN ('active','cancelled','expired') THEN true
    WHEN old_s='expired'      AND new_s IN ('active') THEN true
    ELSE false
  END;

  IF new_s='trial' AND old_s IN ('cancelled','expired','suspended','active','grace_period','past_due') THEN
    allowed := false;
  END IF;
  IF old_s='cancelled' AND new_s <> 'cancelled' THEN allowed := false; END IF;

  IF NOT allowed THEN
    RAISE EXCEPTION 'invalid subscription status transition: % -> %', old_s, new_s USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS tg_subscriptions_validate_transition ON public.subscriptions;
CREATE TRIGGER tg_subscriptions_validate_transition
BEFORE INSERT OR UPDATE OF status ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.validate_subscription_transition();

-- S3: drop pre-existing helper signature conflict, recreate with new param name
DROP FUNCTION IF EXISTS public.enforce_tenant_limit(uuid, text) CASCADE;

CREATE OR REPLACE FUNCTION public.enforce_tenant_limit(_tenant uuid, _resource text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  plan_row RECORD; limit_val integer; current_n integer;
BEGIN
  IF _tenant IS NULL THEN RETURN; END IF;
  IF auth.uid() IS NOT NULL AND public.is_app_admin(auth.uid()) THEN RETURN; END IF;

  SELECT p.max_products, p.max_users, p.max_branches, p.max_warehouses, p.is_unlimited
    INTO plan_row
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.tenant_id = _tenant
  LIMIT 1;

  IF NOT FOUND OR COALESCE(plan_row.is_unlimited, false) THEN RETURN; END IF;

  IF _resource = 'products' THEN
    limit_val := plan_row.max_products;
    IF limit_val IS NULL THEN RETURN; END IF;
    SELECT count(*) INTO current_n FROM public.products WHERE tenant_id = _tenant;
  ELSIF _resource = 'users' THEN
    limit_val := plan_row.max_users;
    IF limit_val IS NULL THEN RETURN; END IF;
    SELECT count(*) INTO current_n FROM public.tenant_members WHERE tenant_id = _tenant;
  ELSIF _resource = 'branches' THEN
    limit_val := plan_row.max_branches;
    IF limit_val IS NULL THEN RETURN; END IF;
    SELECT count(*) INTO current_n FROM public.branches WHERE tenant_id = _tenant;
  ELSIF _resource = 'warehouses' THEN
    limit_val := plan_row.max_warehouses;
    IF limit_val IS NULL THEN RETURN; END IF;
    SELECT count(*) INTO current_n FROM public.warehouses WHERE tenant_id = _tenant;
  ELSE
    RETURN;
  END IF;

  IF current_n >= limit_val THEN
    RAISE EXCEPTION 'Plan limit reached for %: % of % used. Upgrade your subscription to add more.',
      _resource, current_n, limit_val USING ERRCODE='check_violation';
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.tg_enforce_products_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.enforce_tenant_limit(NEW.tenant_id, 'products'); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.tg_enforce_users_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.enforce_tenant_limit(NEW.tenant_id, 'users'); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.tg_enforce_branches_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.enforce_tenant_limit(NEW.tenant_id, 'branches'); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.tg_enforce_warehouses_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.enforce_tenant_limit(NEW.tenant_id, 'warehouses'); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS tg_products_limit ON public.products;
CREATE TRIGGER tg_products_limit BEFORE INSERT ON public.products
FOR EACH ROW EXECUTE FUNCTION public.tg_enforce_products_limit();

DROP TRIGGER IF EXISTS tg_users_limit ON public.tenant_members;
CREATE TRIGGER tg_users_limit BEFORE INSERT ON public.tenant_members
FOR EACH ROW EXECUTE FUNCTION public.tg_enforce_users_limit();

DROP TRIGGER IF EXISTS tg_branches_limit ON public.branches;
CREATE TRIGGER tg_branches_limit BEFORE INSERT ON public.branches
FOR EACH ROW EXECUTE FUNCTION public.tg_enforce_branches_limit();

DROP TRIGGER IF EXISTS tg_warehouses_limit ON public.warehouses;
CREATE TRIGGER tg_warehouses_limit BEFORE INSERT ON public.warehouses
FOR EACH ROW EXECUTE FUNCTION public.tg_enforce_warehouses_limit();
