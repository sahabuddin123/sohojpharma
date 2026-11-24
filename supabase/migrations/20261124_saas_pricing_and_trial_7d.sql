-- Migration: Update Plans to 4 Tiers (Basic 999, Starter 1499, Business 2499, Enterprise Custom)
-- and update Free Trial to 7 Days across triggers and functions

-- 1. Ensure 'business' plan exists, update existing plans, and insert basic if not present
DO $$
DECLARE
  v_basic_id uuid := 'a1111111-1111-4000-8000-000000000001';
  v_starter_id uuid;
  v_biz_id uuid;
  v_ent_id uuid;
BEGIN
  -- Update trial_days to 7 across all plans
  UPDATE public.plans SET trial_days = 7;

  -- 1) Basic Plan (999 BDT / mo, 9990 BDT / yr)
  IF EXISTS (SELECT 1 FROM public.plans WHERE code = 'basic') THEN
    UPDATE public.plans
    SET name = 'Basic',
        price_bdt = 999.00,
        price_yearly_bdt = 9990.00,
        trial_days = 7,
        sort_order = 10,
        max_branches = 1,
        max_users = 2,
        max_products = 50000,
        is_active = true,
        updated_at = now()
    WHERE code = 'basic';
  ELSE
    INSERT INTO public.plans (
      id, code, slug, name, price_bdt, price_yearly_bdt, trial_days,
      sort_order, max_branches, max_users, max_products, is_active, billing_interval,
      features, payment_methods
    ) VALUES (
      v_basic_id, 'basic', 'basic', 'Basic', 999.00, 9990.00, 7,
      10, 1, 2, 50000, true, 'monthly',
      '{"pos": true, "inventory": true, "basic_reports": true, "email_support": true}'::jsonb,
      '["bkash", "nagad", "rocket", "bank", "cash"]'::jsonb
    );
  END IF;

  -- 2) Starter Plan (1,499 BDT / mo, 14,990 BDT / yr)
  IF EXISTS (SELECT 1 FROM public.plans WHERE code = 'starter') THEN
    UPDATE public.plans
    SET name = 'Starter',
        price_bdt = 1499.00,
        price_yearly_bdt = 14990.00,
        trial_days = 7,
        sort_order = 20,
        max_branches = 2,
        max_users = 5,
        max_products = 50000,
        is_active = true,
        features = '{"pos": true, "inventory": true, "purchase": true, "basic_accounts": true, "phone_support": true}'::jsonb,
        updated_at = now()
    WHERE code = 'starter';
  END IF;

  -- 3) Business Plan (2,499 BDT / mo, 24,990 BDT / yr)
  IF EXISTS (SELECT 1 FROM public.plans WHERE code = 'business') THEN
    UPDATE public.plans
    SET name = 'Business',
        price_bdt = 2499.00,
        price_yearly_bdt = 24990.00,
        trial_days = 7,
        sort_order = 30,
        max_branches = 5,
        max_users = 15,
        max_products = 100000,
        is_active = true,
        features = '{"pos": true, "inventory": true, "all_modules": true, "advanced_reports": true, "priority_support": true, "whatsapp_support": true}'::jsonb,
        updated_at = now()
    WHERE code = 'business';
  ELSIF EXISTS (SELECT 1 FROM public.plans WHERE code = 'pro') THEN
    -- Update existing pro to business
    UPDATE public.plans
    SET code = 'business',
        slug = 'business',
        name = 'Business',
        price_bdt = 2499.00,
        price_yearly_bdt = 24990.00,
        trial_days = 7,
        sort_order = 30,
        max_branches = 5,
        max_users = 15,
        max_products = 100000,
        is_active = true,
        features = '{"pos": true, "inventory": true, "all_modules": true, "advanced_reports": true, "priority_support": true, "whatsapp_support": true}'::jsonb,
        updated_at = now()
    WHERE code = 'pro';
  ELSE
    INSERT INTO public.plans (
      id, code, slug, name, price_bdt, price_yearly_bdt, trial_days,
      sort_order, max_branches, max_users, max_products, is_active, billing_interval,
      features, payment_methods
    ) VALUES (
      'a2222222-2222-4000-8000-000000000002', 'business', 'business', 'Business', 2499.00, 24990.00, 7,
      30, 5, 15, 100000, true, 'monthly',
      '{"pos": true, "inventory": true, "all_modules": true, "advanced_reports": true, "priority_support": true, "whatsapp_support": true}'::jsonb,
      '["bkash", "nagad", "rocket", "bank", "cash"]'::jsonb
    );
  END IF;

  -- 4) Enterprise Plan (Custom price / 0 BDT)
  IF EXISTS (SELECT 1 FROM public.plans WHERE code = 'enterprise') THEN
    UPDATE public.plans
    SET name = 'Enterprise',
        price_bdt = 0.00,
        price_yearly_bdt = 0.00,
        trial_days = 7,
        sort_order = 40,
        max_branches = 999,
        max_users = 999,
        max_products = 500000,
        is_unlimited = true,
        is_active = true,
        features = '{"pos": true, "inventory": true, "all_modules": true, "unlimited_branches": true, "unlimited_users": true, "api_access": true, "dedicated_manager": true, "custom_support": true}'::jsonb,
        updated_at = now()
    WHERE code = 'enterprise';
  END IF;

  -- Free Plan update (7-day trial)
  IF EXISTS (SELECT 1 FROM public.plans WHERE code = 'free') THEN
    UPDATE public.plans
    SET trial_days = 7,
        sort_order = 5,
        updated_at = now()
    WHERE code = 'free';
  END IF;
END $$;

-- 2. Update bootstrap_trial_subscription function to 7 days
CREATE OR REPLACE FUNCTION public.bootstrap_trial_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan public.plans;
BEGIN
  SELECT * INTO v_plan FROM public.plans WHERE code = 'free' LIMIT 1;
  IF NOT FOUND THEN
    SELECT * INTO v_plan FROM public.plans ORDER BY sort_order ASC LIMIT 1;
  END IF;
  IF NOT FOUND THEN RETURN NEW; END IF;

  INSERT INTO public.subscriptions(
    tenant_id, plan_id, status, billing_cycle,
    current_period_start, current_period_end, trial_ends_at
  ) VALUES (
    NEW.id, v_plan.id, 'trial', 'monthly',
    now(), now() + interval '7 days',
    now() + interval '7 days'
  )
  ON CONFLICT (tenant_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- 3. Update auto_trial_on_tenant_insert function to 7 days
CREATE OR REPLACE FUNCTION public.auto_trial_on_tenant_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.subscriptions WHERE tenant_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_plan_id FROM public.plans
    WHERE is_active = true
    ORDER BY COALESCE(sort_order, 999), price_bdt NULLS LAST
    LIMIT 1;

  IF v_plan_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.subscriptions (
    tenant_id, plan_id, status, billing_cycle,
    starts_at, expires_at, grace_until, auto_renew
  ) VALUES (
    NEW.id, v_plan_id, 'trial', 'monthly',
    now(), now() + interval '7 days', now() + interval '7 days', false
  )
  ON CONFLICT (tenant_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- 4. Stored Procedure for Admin to Approve Store with Plan and Duration
CREATE OR REPLACE FUNCTION public.admin_approve_store_with_plan(
  p_tenant_id uuid,
  p_plan_id uuid DEFAULT NULL,
  p_duration_months int DEFAULT 0,
  p_remarks text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan public.plans;
  v_period_end timestamptz;
  v_sub_status text;
BEGIN
  -- Determine plan
  IF p_plan_id IS NOT NULL THEN
    SELECT * INTO v_plan FROM public.plans WHERE id = p_plan_id;
  END IF;
  
  IF v_plan.id IS NULL THEN
    SELECT * INTO v_plan FROM public.plans WHERE code = 'basic';
  END IF;

  IF v_plan.id IS NULL THEN
    SELECT * INTO v_plan FROM public.plans ORDER BY sort_order ASC LIMIT 1;
  END IF;

  -- Duration calculation: 0 = 7 days trial, > 0 = N months
  IF p_duration_months <= 0 THEN
    v_period_end := now() + interval '7 days';
    v_sub_status := 'trial';
  ELSE
    v_period_end := now() + (p_duration_months || ' months')::interval;
    v_sub_status := 'active';
  END IF;

  -- Activate tenant and update plan code
  UPDATE public.tenants
  SET status = 'active',
      plan = v_plan.code,
      updated_at = now()
  WHERE id = p_tenant_id;

  -- Upsert subscription
  INSERT INTO public.subscriptions (
    tenant_id, plan_id, status, billing_cycle,
    starts_at, expires_at, current_period_start, current_period_end,
    trial_ends_at, grace_until, auto_renew, updated_at
  ) VALUES (
    p_tenant_id, v_plan.id, v_sub_status, 'monthly',
    now(), v_period_end, now(), v_period_end,
    CASE WHEN v_sub_status = 'trial' THEN v_period_end ELSE NULL END,
    v_period_end + interval '3 days',
    false, now()
  )
  ON CONFLICT (tenant_id) DO UPDATE
  SET plan_id = EXCLUDED.plan_id,
      status = EXCLUDED.status,
      current_period_start = now(),
      current_period_end = EXCLUDED.current_period_end,
      expires_at = EXCLUDED.expires_at,
      trial_ends_at = EXCLUDED.trial_ends_at,
      grace_until = EXCLUDED.grace_until,
      updated_at = now();

  -- Log approval
  INSERT INTO public.approval_logs (tenant_id, from_status, to_status, remarks, created_at)
  VALUES (p_tenant_id, 'pending', 'active', COALESCE(p_remarks, 'Approved by admin with plan ' || v_plan.name), now());

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', p_tenant_id,
    'plan', v_plan.name,
    'status', v_sub_status,
    'expires_at', v_period_end
  );
END;
$$;
