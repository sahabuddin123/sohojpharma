
-- ============================================================
-- Billing schema hardening (Stripe-ready, provider-agnostic)
-- ============================================================

-- 1) subscriptions: add Stripe-ready columns
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_customer_id      text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id  text,
  ADD COLUMN IF NOT EXISTS stripe_price_id         text,
  ADD COLUMN IF NOT EXISTS billing_cycle           text NOT NULL DEFAULT 'monthly'
    CHECK (billing_cycle IN ('monthly','yearly')),
  ADD COLUMN IF NOT EXISTS cancel_at_period_end    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS grace_period_ends_at    timestamptz,
  ADD COLUMN IF NOT EXISTS last_payment_at         timestamptz,
  ADD COLUMN IF NOT EXISTS last_payment_failed_at  timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_stripe_sub_uidx
  ON public.subscriptions(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS subscriptions_tenant_status_idx
  ON public.subscriptions(tenant_id, status);

CREATE INDEX IF NOT EXISTS subscriptions_period_end_idx
  ON public.subscriptions(current_period_end)
  WHERE status IN ('trialing','active','past_due');

-- 2) plans: add Stripe price ids + yearly pricing
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS price_yearly_bdt        numeric(14,2),
  ADD COLUMN IF NOT EXISTS stripe_price_monthly_id text,
  ADD COLUMN IF NOT EXISTS stripe_price_yearly_id  text,
  ADD COLUMN IF NOT EXISTS trial_days              integer NOT NULL DEFAULT 14;

-- 3) billing_events: durable webhook + audit trail
CREATE TABLE IF NOT EXISTS public.billing_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  subscription_id  uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  provider         text NOT NULL DEFAULT 'stripe',
  event_type       text NOT NULL,                -- e.g. invoice.paid, subscription.updated
  event_id         text,                         -- provider event id (stripe evt_*)
  amount           numeric(14,2),
  currency         text,
  status           text,                         -- succeeded, failed, pending
  payload          jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message    text,
  processed_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.billing_events TO authenticated;
GRANT ALL    ON public.billing_events TO service_role;
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_members read billing_events"
  ON public.billing_events FOR SELECT TO authenticated
  USING (tenant_id IS NOT NULL AND public.is_tenant_member(auth.uid(), tenant_id));

CREATE UNIQUE INDEX IF NOT EXISTS billing_events_provider_event_uidx
  ON public.billing_events(provider, event_id)
  WHERE event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS billing_events_tenant_created_idx
  ON public.billing_events(tenant_id, created_at DESC);

-- 4) Seed/update default plans (idempotent)
INSERT INTO public.plans(code,name,max_products,max_users,max_branches,
                         price_bdt,price_yearly_bdt,billing_interval,
                         features,is_active,sort_order,trial_days)
VALUES
  ('free',         'Free',         200,    1,  1,     0,      0,      'monthly',
     '{"reports":"basic","support":"community"}', true, 10, 14),
  ('starter',      'Starter',      5000,   3,  1,   990,   9900,     'monthly',
     '{"reports":"standard","support":"email"}',  true, 20, 14),
  ('professional', 'Professional', NULL,   10, 3,  2990,  29900,     'monthly',
     '{"reports":"advanced","support":"priority","api":true}', true, 30, 14),
  ('enterprise',   'Enterprise',   NULL,   NULL, NULL, 9990, 99900,  'monthly',
     '{"reports":"all","support":"dedicated","api":true,"sso":true}', true, 40, 14)
ON CONFLICT (code) DO UPDATE
SET name             = EXCLUDED.name,
    max_products     = EXCLUDED.max_products,
    max_users        = EXCLUDED.max_users,
    max_branches     = EXCLUDED.max_branches,
    price_bdt        = EXCLUDED.price_bdt,
    price_yearly_bdt = EXCLUDED.price_yearly_bdt,
    features         = EXCLUDED.features,
    is_active        = EXCLUDED.is_active,
    sort_order       = EXCLUDED.sort_order,
    trial_days       = EXCLUDED.trial_days;

-- 5) Helper: current active subscription (most recent non-cancelled)
CREATE OR REPLACE FUNCTION public.get_active_subscription(_tenant_id uuid)
RETURNS public.subscriptions
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM public.subscriptions
   WHERE tenant_id = _tenant_id
     AND status IN ('trialing','active','past_due')
   ORDER BY created_at DESC
   LIMIT 1
$$;

-- 6) Helper: is subscription active right now (includes grace + trial)
CREATE OR REPLACE FUNCTION public.is_subscription_active(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions s
     WHERE s.tenant_id = _tenant_id
       AND (
         (s.status = 'trialing'  AND COALESCE(s.trial_ends_at, now()) > now()) OR
         (s.status = 'active'    AND COALESCE(s.current_period_end, now() + interval '1 day') > now()) OR
         (s.status = 'past_due'  AND COALESCE(s.grace_period_ends_at, now()) > now())
       )
  )
$$;

-- 7) Plan-limit gate used by app code BEFORE create operations
--    (the existing enforce_product_limit / enforce_user_limit triggers
--    remain as defense-in-depth)
CREATE OR REPLACE FUNCTION public.can_create_resource(
  _tenant_id uuid,
  _resource  text   -- 'product' | 'user' | 'branch'
) RETURNS TABLE(allowed boolean, used integer, max_allowed integer, reason text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_plan_code  text;
  v_max        integer;
  v_used       integer;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  SELECT t.plan::text INTO v_plan_code FROM public.tenants t WHERE t.id = _tenant_id;

  SELECT
    CASE _resource
      WHEN 'product' THEN p.max_products
      WHEN 'user'    THEN p.max_users
      WHEN 'branch'  THEN p.max_branches
    END
  INTO v_max
  FROM public.plans p WHERE p.code = v_plan_code;

  v_used := CASE _resource
    WHEN 'product' THEN (SELECT count(*)::int FROM public.products       WHERE tenant_id = _tenant_id)
    WHEN 'user'    THEN (SELECT count(*)::int FROM public.tenant_members WHERE tenant_id = _tenant_id)
    WHEN 'branch'  THEN (SELECT count(*)::int FROM public.branches       WHERE tenant_id = _tenant_id)
    ELSE 0
  END;

  IF v_max IS NULL THEN
    RETURN QUERY SELECT true, v_used, NULL::int, NULL::text;
  ELSIF v_used >= v_max THEN
    RETURN QUERY SELECT false, v_used, v_max,
      format('Plan %s allows max %s %ss. Upgrade to add more.', v_plan_code, v_max, _resource);
  ELSE
    RETURN QUERY SELECT true, v_used, v_max, NULL::text;
  END IF;
END $$;

-- 8) Bootstrap trial subscription on new tenant (idempotent)
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
    NEW.id, v_plan.id, 'trialing', 'monthly',
    now(), now() + (v_plan.trial_days || ' days')::interval,
    now() + (v_plan.trial_days || ' days')::interval
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tenants_bootstrap_trial ON public.tenants;
CREATE TRIGGER tenants_bootstrap_trial
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.bootstrap_trial_subscription();

-- 9) Backfill: any tenant without a subscription gets a free-trial row
INSERT INTO public.subscriptions(
  tenant_id, plan_id, status, billing_cycle,
  current_period_start, current_period_end, trial_ends_at
)
SELECT t.id, p.id, 'trialing', 'monthly',
       now(), now() + (p.trial_days || ' days')::interval,
       now() + (p.trial_days || ' days')::interval
FROM public.tenants t
CROSS JOIN LATERAL (SELECT * FROM public.plans WHERE code='free' LIMIT 1) p
WHERE NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.tenant_id = t.id);
