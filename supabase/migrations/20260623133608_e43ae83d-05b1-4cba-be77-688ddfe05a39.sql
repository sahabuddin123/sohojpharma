
-- 1) plans: extend billing intervals + add new columns
ALTER TABLE public.plans DROP CONSTRAINT IF EXISTS plans_billing_interval_check;
ALTER TABLE public.plans
  ADD CONSTRAINT plans_billing_interval_check
  CHECK (billing_interval = ANY (ARRAY['monthly','quarterly','half_yearly','yearly','lifetime']));

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS max_storage_mb integer,
  ADD COLUMN IF NOT EXISTS max_api_requests_per_month integer;

UPDATE public.plans
   SET slug = regexp_replace(lower(coalesce(slug, code)), '[^a-z0-9]+', '-', 'g')
 WHERE slug IS NULL OR slug = '';

-- de-dup slugs in case of any legacy collision before adding the constraint
WITH d AS (
  SELECT id, slug,
         row_number() OVER (PARTITION BY slug ORDER BY created_at) AS rn
    FROM public.plans
)
UPDATE public.plans p
   SET slug = p.slug || '-' || d.rn
  FROM d
 WHERE p.id = d.id AND d.rn > 1;

ALTER TABLE public.plans ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS plans_slug_uidx ON public.plans (slug);

-- 2) subscriptions: extend cycles + statuses + notes
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_billing_cycle_check;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_billing_cycle_check
  CHECK (billing_cycle = ANY (ARRAY['monthly','quarterly','half_yearly','yearly','lifetime']));

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status = ANY (ARRAY['trial','active','past_due','expired','cancelled','suspended']));

ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS notes text;

-- 3) helper
CREATE OR REPLACE FUNCTION public._cycle_months(_cycle text)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _cycle
    WHEN 'monthly' THEN 1
    WHEN 'quarterly' THEN 3
    WHEN 'half_yearly' THEN 6
    WHEN 'yearly' THEN 12
    WHEN 'lifetime' THEN 1200
    ELSE 1
  END;
$$;

-- 4) admin RPCs
CREATE OR REPLACE FUNCTION public.admin_assign_plan(
  p_tenant uuid, p_plan uuid, p_cycle text, p_trial_days integer
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_now timestamptz := now(); v_trial_end timestamptz; v_period_end timestamptz;
BEGIN
  IF NOT public.is_app_admin(auth.uid()) THEN RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501'; END IF;
  v_trial_end := CASE WHEN p_trial_days > 0 THEN v_now + (p_trial_days || ' days')::interval ELSE NULL END;
  v_period_end := COALESCE(v_trial_end, v_now + (public._cycle_months(p_cycle) || ' months')::interval);
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
END; $$;

CREATE OR REPLACE FUNCTION public.admin_change_plan(p_subscription uuid, p_new_plan uuid, p_cycle text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_app_admin(auth.uid()) THEN RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501'; END IF;
  UPDATE public.subscriptions SET plan_id = p_new_plan, billing_cycle = p_cycle, updated_at = now()
   WHERE id = p_subscription;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_renew_subscription(p_subscription uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cycle text; v_end timestamptz;
BEGIN
  IF NOT public.is_app_admin(auth.uid()) THEN RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501'; END IF;
  SELECT billing_cycle, GREATEST(current_period_end, now()) INTO v_cycle, v_end
    FROM public.subscriptions WHERE id = p_subscription;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription_not_found'; END IF;
  UPDATE public.subscriptions
     SET current_period_start = v_end,
         current_period_end = v_end + (public._cycle_months(v_cycle) || ' months')::interval,
         expires_at = v_end + (public._cycle_months(v_cycle) || ' months')::interval,
         status = 'active', cancelled_at = NULL, last_payment_at = now(), updated_at = now()
   WHERE id = p_subscription;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_set_subscription_status(p_subscription uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_app_admin(auth.uid()) THEN RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501'; END IF;
  IF p_status NOT IN ('trial','active','past_due','expired','cancelled','suspended') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;
  UPDATE public.subscriptions
     SET status = p_status,
         cancelled_at = CASE WHEN p_status = 'cancelled' THEN now() ELSE cancelled_at END,
         updated_at = now()
   WHERE id = p_subscription;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_convert_trial(p_subscription uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cycle text;
BEGIN
  IF NOT public.is_app_admin(auth.uid()) THEN RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501'; END IF;
  SELECT billing_cycle INTO v_cycle FROM public.subscriptions WHERE id = p_subscription;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription_not_found'; END IF;
  UPDATE public.subscriptions
     SET status = 'active', trial_ends_at = NULL,
         current_period_start = now(),
         current_period_end = now() + (public._cycle_months(v_cycle) || ' months')::interval,
         expires_at = now() + (public._cycle_months(v_cycle) || ' months')::interval,
         last_payment_at = now(), updated_at = now()
   WHERE id = p_subscription;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_plan_analytics()
RETURNS TABLE (
  plan_id uuid, plan_name text, plan_code text,
  active_count bigint, trial_count bigint, expired_count bigint, suspended_count bigint,
  mrr numeric, revenue_last_30d numeric
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p.id, p.name, p.code,
    COUNT(*) FILTER (WHERE s.status = 'active'),
    COUNT(*) FILTER (WHERE s.status = 'trial'),
    COUNT(*) FILTER (WHERE s.status IN ('expired','cancelled')),
    COUNT(*) FILTER (WHERE s.status = 'suspended'),
    COALESCE(SUM(
      CASE WHEN s.status = 'active' THEN
        CASE s.billing_cycle
          WHEN 'monthly' THEN p.price_bdt
          WHEN 'quarterly' THEN p.price_bdt
          WHEN 'half_yearly' THEN COALESCE(p.price_yearly_bdt, p.price_bdt * 12) / 12.0
          WHEN 'yearly' THEN COALESCE(p.price_yearly_bdt, p.price_bdt * 12) / 12.0
          WHEN 'lifetime' THEN 0
          ELSE p.price_bdt
        END
      ELSE 0 END
    ), 0),
    COALESCE((
      SELECT SUM(sp.amount) FROM public.subscription_payments sp
       WHERE sp.plan_id = p.id AND sp.status = 'success'
         AND sp.created_at >= now() - interval '30 days'
    ), 0)
  FROM public.plans p
  LEFT JOIN public.subscriptions s ON s.plan_id = p.id
  GROUP BY p.id, p.name, p.code, p.sort_order
  ORDER BY p.sort_order;
$$;

GRANT EXECUTE ON FUNCTION public.admin_assign_plan(uuid, uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_change_plan(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_renew_subscription(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_subscription_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_convert_trial(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_plan_analytics() TO authenticated;
GRANT EXECUTE ON FUNCTION public._cycle_months(text) TO authenticated;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.subscriptions;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
