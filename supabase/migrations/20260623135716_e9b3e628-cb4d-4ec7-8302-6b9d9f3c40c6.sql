
-- 1. plan_pricing table
CREATE TABLE IF NOT EXISTS public.plan_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  billing_cycle text NOT NULL CHECK (billing_cycle IN ('monthly','quarterly','half_yearly','yearly','lifetime')),
  duration_days integer NOT NULL CHECK (duration_days > 0),
  price_bdt numeric(12,2) NOT NULL CHECK (price_bdt >= 0),
  discount_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, billing_cycle)
);

CREATE INDEX IF NOT EXISTS plan_pricing_plan_active_idx
  ON public.plan_pricing (plan_id, is_active);

GRANT SELECT ON public.plan_pricing TO authenticated;
GRANT ALL ON public.plan_pricing TO service_role;

ALTER TABLE public.plan_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY plan_pricing_read_active
  ON public.plan_pricing FOR SELECT TO authenticated
  USING (
    is_active = true
    AND EXISTS (SELECT 1 FROM public.plans p WHERE p.id = plan_id AND p.is_active = true)
  );

CREATE POLICY plan_pricing_admin_read
  ON public.plan_pricing FOR SELECT TO authenticated
  USING (public.is_app_admin(auth.uid()));

CREATE POLICY plan_pricing_admin_write
  ON public.plan_pricing FOR ALL TO authenticated
  USING (public.is_app_admin(auth.uid()))
  WITH CHECK (public.is_app_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.tg_plan_pricing_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS plan_pricing_touch ON public.plan_pricing;
CREATE TRIGGER plan_pricing_touch
  BEFORE UPDATE ON public.plan_pricing
  FOR EACH ROW EXECUTE FUNCTION public.tg_plan_pricing_touch();

-- 2. helper: cycle -> default duration days
CREATE OR REPLACE FUNCTION public._cycle_days(p_cycle text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE p_cycle
    WHEN 'monthly'     THEN 30
    WHEN 'quarterly'   THEN 90
    WHEN 'half_yearly' THEN 180
    WHEN 'yearly'      THEN 365
    WHEN 'lifetime'    THEN 36500
    ELSE 30
  END
$$;

-- 3. backfill from existing plans (monthly always, yearly if set)
INSERT INTO public.plan_pricing (plan_id, billing_cycle, duration_days, price_bdt, discount_percent, is_active)
SELECT p.id, 'monthly', 30, p.price_bdt, 0, p.is_active
FROM public.plans p
ON CONFLICT (plan_id, billing_cycle) DO NOTHING;

INSERT INTO public.plan_pricing (plan_id, billing_cycle, duration_days, price_bdt, discount_percent, is_active)
SELECT p.id, 'yearly', 365, p.price_yearly_bdt, 0, p.is_active
FROM public.plans p
WHERE p.price_yearly_bdt IS NOT NULL AND p.price_yearly_bdt > 0
ON CONFLICT (plan_id, billing_cycle) DO NOTHING;

-- 4. public lookup: effective price + duration for (plan, cycle)
CREATE OR REPLACE FUNCTION public.get_plan_pricing(p_plan uuid, p_cycle text)
RETURNS TABLE(price_bdt numeric, discount_percent numeric, duration_days integer, net_price numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pp.price_bdt,
         pp.discount_percent,
         pp.duration_days,
         ROUND(pp.price_bdt * (1 - pp.discount_percent/100.0), 2) AS net_price
  FROM public.plan_pricing pp
  WHERE pp.plan_id = p_plan
    AND pp.billing_cycle = p_cycle
    AND pp.is_active = true
  LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.get_plan_pricing(uuid, text) TO authenticated, anon;

-- 5. update lifecycle RPCs to use plan_pricing for duration/expiry
CREATE OR REPLACE FUNCTION public.admin_assign_plan(p_tenant uuid, p_plan uuid, p_cycle text, p_trial_days integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_now timestamptz := now();
  v_trial_end timestamptz;
  v_period_end timestamptz;
  v_days integer;
BEGIN
  IF NOT public.is_app_admin(auth.uid()) THEN RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE='42501'; END IF;
  SELECT duration_days INTO v_days FROM public.get_plan_pricing(p_plan, p_cycle);
  IF v_days IS NULL THEN v_days := public._cycle_days(p_cycle); END IF;
  v_trial_end  := CASE WHEN p_trial_days > 0 THEN v_now + (p_trial_days || ' days')::interval ELSE NULL END;
  v_period_end := COALESCE(v_trial_end, v_now + (v_days || ' days')::interval);
  INSERT INTO public.subscriptions (
    tenant_id, plan_id, status, billing_cycle,
    current_period_start, current_period_end, starts_at, expires_at, trial_ends_at, updated_at
  ) VALUES (
    p_tenant, p_plan,
    CASE WHEN v_trial_end IS NOT NULL THEN 'trial' ELSE 'active' END,
    p_cycle, v_now, v_period_end, v_now, v_period_end, v_trial_end, v_now
  )
  ON CONFLICT (tenant_id) DO UPDATE
    SET plan_id = EXCLUDED.plan_id, status = EXCLUDED.status,
        billing_cycle = EXCLUDED.billing_cycle,
        current_period_start = EXCLUDED.current_period_start,
        current_period_end = EXCLUDED.current_period_end,
        starts_at = EXCLUDED.starts_at, expires_at = EXCLUDED.expires_at,
        trial_ends_at = EXCLUDED.trial_ends_at, cancelled_at = NULL, updated_at = v_now
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_renew_subscription(p_subscription uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cycle text; v_plan uuid; v_end timestamptz; v_days integer;
BEGIN
  IF NOT public.is_app_admin(auth.uid()) THEN RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE='42501'; END IF;
  SELECT billing_cycle, plan_id, GREATEST(current_period_end, now())
    INTO v_cycle, v_plan, v_end
    FROM public.subscriptions WHERE id = p_subscription;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription_not_found'; END IF;
  SELECT duration_days INTO v_days FROM public.get_plan_pricing(v_plan, v_cycle);
  IF v_days IS NULL THEN v_days := public._cycle_days(v_cycle); END IF;
  UPDATE public.subscriptions
     SET current_period_start = v_end,
         current_period_end = v_end + (v_days || ' days')::interval,
         expires_at = v_end + (v_days || ' days')::interval,
         status = 'active', cancelled_at = NULL, last_payment_at = now(), updated_at = now()
   WHERE id = p_subscription;
END $$;
