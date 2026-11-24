
-- Subscription Enforcement Engine
CREATE OR REPLACE FUNCTION public.plan_limits(_plan public.tenant_plan)
RETURNS TABLE(max_products int, max_users int)
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT
    CASE _plan
      WHEN 'free'       THEN 200
      WHEN 'starter'    THEN 5000
      WHEN 'pro'        THEN NULL
      WHEN 'enterprise' THEN NULL
    END,
    CASE _plan
      WHEN 'free'       THEN 1
      WHEN 'starter'    THEN 3
      WHEN 'pro'        THEN 10
      WHEN 'enterprise' THEN NULL
    END;
$$;

CREATE OR REPLACE FUNCTION public.check_plan_usage(_tenant_id uuid)
RETURNS TABLE(
  plan public.tenant_plan,
  products_used int, products_limit int, products_over boolean,
  users_used int, users_limit int, users_over boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_plan public.tenant_plan; v_pmax int; v_umax int; v_p int; v_u int;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  SELECT t.plan INTO v_plan FROM public.tenants t WHERE t.id = _tenant_id;
  SELECT l.max_products, l.max_users INTO v_pmax, v_umax FROM public.plan_limits(v_plan) l;
  SELECT count(*) INTO v_p FROM public.products WHERE tenant_id = _tenant_id;
  SELECT count(*) INTO v_u FROM public.tenant_members WHERE tenant_id = _tenant_id;
  RETURN QUERY SELECT
    v_plan,
    v_p, v_pmax, (v_pmax IS NOT NULL AND v_p >= v_pmax),
    v_u, v_umax, (v_umax IS NOT NULL AND v_u >= v_umax);
END $$;

CREATE OR REPLACE FUNCTION public.enforce_product_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_plan public.tenant_plan; v_max int; v_count int;
BEGIN
  SELECT plan INTO v_plan FROM public.tenants WHERE id = NEW.tenant_id;
  SELECT max_products INTO v_max FROM public.plan_limits(v_plan);
  IF v_max IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_count FROM public.products WHERE tenant_id = NEW.tenant_id;
  IF v_count >= v_max THEN
    RAISE EXCEPTION 'plan_limit_exceeded: plan % allows max % products (current=%)', v_plan, v_max, v_count
      USING ERRCODE='P0001', HINT='Upgrade your subscription plan to add more products';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_user_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_plan public.tenant_plan; v_max int; v_count int;
BEGIN
  SELECT plan INTO v_plan FROM public.tenants WHERE id = NEW.tenant_id;
  SELECT max_users INTO v_max FROM public.plan_limits(v_plan);
  IF v_max IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_count FROM public.tenant_members WHERE tenant_id = NEW.tenant_id;
  IF v_count >= v_max THEN
    RAISE EXCEPTION 'plan_limit_exceeded: plan % allows max % users (current=%)', v_plan, v_max, v_count
      USING ERRCODE='P0001', HINT='Upgrade your subscription plan to add more users';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_product_limit ON public.products;
CREATE TRIGGER trg_enforce_product_limit
  BEFORE INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_limit();

DROP TRIGGER IF EXISTS trg_enforce_user_limit ON public.tenant_members;
CREATE TRIGGER trg_enforce_user_limit
  BEFORE INSERT ON public.tenant_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_user_limit();
