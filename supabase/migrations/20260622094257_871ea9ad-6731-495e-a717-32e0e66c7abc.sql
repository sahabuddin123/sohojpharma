DO $$
DECLARE
  v_super_id uuid;
  v_store_id uuid;
  v_tenant_id uuid;
  v_branch_id uuid;
  v_wh_id uuid;
  v_plan_id uuid;
BEGIN
  SELECT id INTO v_super_id FROM auth.users WHERE email='superadmin@gmail.com';
  IF v_super_id IS NULL THEN
    v_super_id := gen_random_uuid();
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, email_change, email_change_token_new, recovery_token)
    VALUES ('00000000-0000-0000-0000-000000000000', v_super_id, 'authenticated', 'authenticated', 'superadmin@gmail.com', crypt('123456', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"name":"SaaS Super Admin"}'::jsonb, '', '', '', '');
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_super_id, jsonb_build_object('sub', v_super_id::text, 'email', 'superadmin@gmail.com'), 'email', v_super_id::text, now(), now(), now());
  END IF;
  INSERT INTO public.app_admins (user_id, created_at) VALUES (v_super_id, now()) ON CONFLICT (user_id) DO NOTHING;
  DELETE FROM public.tenant_members WHERE user_id = v_super_id;

  SELECT id INTO v_store_id FROM auth.users WHERE email='storeadmin@gmail.com';
  IF v_store_id IS NULL THEN
    v_store_id := gen_random_uuid();
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, email_change, email_change_token_new, recovery_token)
    VALUES ('00000000-0000-0000-0000-000000000000', v_store_id, 'authenticated', 'authenticated', 'storeadmin@gmail.com', crypt('123456', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"name":"Demo Store Admin"}'::jsonb, '', '', '', '');
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_store_id, jsonb_build_object('sub', v_store_id::text, 'email', 'storeadmin@gmail.com'), 'email', v_store_id::text, now(), now(), now());
  END IF;

  SELECT tm.tenant_id INTO v_tenant_id FROM public.tenant_members tm WHERE tm.user_id = v_store_id LIMIT 1;
  IF v_tenant_id IS NULL THEN
    INSERT INTO public.tenants (name, slug, business_type, country, status, language)
    VALUES ('Demo Pharmacy', 'demo-pharmacy-'||substr(v_store_id::text,1,8), 'pharmacy', 'BD', 'active', 'en')
    RETURNING id INTO v_tenant_id;
    INSERT INTO public.tenant_members (tenant_id, user_id, is_default) VALUES (v_tenant_id, v_store_id, true);
  END IF;

  SELECT id INTO v_branch_id FROM public.branches WHERE tenant_id=v_tenant_id AND is_main=true LIMIT 1;
  IF v_branch_id IS NULL THEN
    INSERT INTO public.branches (tenant_id, code, name, is_main, is_active, branch_role)
    VALUES (v_tenant_id, 'MAIN', 'Main Branch', true, true, 'branch') RETURNING id INTO v_branch_id;
  END IF;

  SELECT id INTO v_wh_id FROM public.warehouses WHERE tenant_id=v_tenant_id AND is_default=true LIMIT 1;
  IF v_wh_id IS NULL THEN
    INSERT INTO public.warehouses (tenant_id, branch_id, code, name, is_default, is_active, is_hq)
    VALUES (v_tenant_id, v_branch_id, 'WH-MAIN', 'Main Warehouse', true, true, true) RETURNING id INTO v_wh_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.cash_registers WHERE tenant_id=v_tenant_id AND status='open') THEN
    INSERT INTO public.cash_registers (tenant_id, branch_id, user_id, register_name, opening_amount, status)
    VALUES (v_tenant_id, v_branch_id, v_store_id, 'Main Register', 0, 'open');
  END IF;

  SELECT id INTO v_plan_id FROM public.plans WHERE code='pro' LIMIT 1;
  IF NOT EXISTS (SELECT 1 FROM public.subscriptions WHERE tenant_id=v_tenant_id) THEN
    INSERT INTO public.subscriptions (tenant_id, plan_id, status, current_period_start, current_period_end, billing_cycle, auto_renew, starts_at, expires_at)
    VALUES (v_tenant_id, v_plan_id, 'active', now(), now()+interval '1 year', 'yearly', true, now(), now()+interval '1 year');
  END IF;

  INSERT INTO public.tenant_onboarding_progress (tenant_id, step_company, step_branches, step_warehouses, step_suppliers, step_products, step_opening_stock, completed_at)
  VALUES (v_tenant_id, true, true, true, true, true, true, now())
  ON CONFLICT (tenant_id) DO UPDATE SET
    step_company=true, step_branches=true, step_warehouses=true,
    step_suppliers=true, step_products=true, step_opening_stock=true,
    completed_at=COALESCE(public.tenant_onboarding_progress.completed_at, now()),
    updated_at=now();
END $$;