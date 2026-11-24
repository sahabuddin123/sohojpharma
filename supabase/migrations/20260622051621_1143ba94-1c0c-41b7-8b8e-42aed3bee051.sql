-- Phase 2.3 — Remove legacy 'trialing' status string. Single source of truth = 'trial'.

-- 1) Replace legacy index that filters on 'trialing'
DROP INDEX IF EXISTS public.subscriptions_period_end_idx;
CREATE INDEX IF NOT EXISTS subscriptions_period_end_idx
  ON public.subscriptions(current_period_end)
  WHERE status IN ('trial','active','past_due');

-- 2) Re-define helpers that still reference 'trialing'
CREATE OR REPLACE FUNCTION public.get_active_subscription(_tenant_id uuid)
RETURNS public.subscriptions
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM public.subscriptions
   WHERE tenant_id = _tenant_id
     AND status IN ('trial','active','past_due')
   ORDER BY created_at DESC
   LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_subscription_active(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions s
     WHERE s.tenant_id = _tenant_id
       AND (
         (s.status = 'trial'    AND COALESCE(s.trial_ends_at, now()) > now()) OR
         (s.status = 'active'   AND COALESCE(s.current_period_end, now() + interval '1 day') > now()) OR
         (s.status = 'past_due' AND COALESCE(s.grace_period_ends_at, now()) > now())
       )
  )
$$;

-- 3) Re-define bootstrap trigger function to insert 'trial'
CREATE OR REPLACE FUNCTION public.bootstrap_trial_subscription()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_plan public.plans;
BEGIN
  SELECT * INTO v_plan FROM public.plans WHERE code = 'free' LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;

  INSERT INTO public.subscriptions(
    tenant_id, plan_id, status, billing_cycle,
    current_period_start, current_period_end, trial_ends_at
  ) VALUES (
    NEW.id, v_plan.id, 'trial', 'monthly',
    now(), now() + (v_plan.trial_days || ' days')::interval,
    now() + (v_plan.trial_days || ' days')::interval
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END $$;

-- 4) Belt-and-braces backfill any rows that slipped through
UPDATE public.subscriptions SET status = 'trial' WHERE status = 'trialing';