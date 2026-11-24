ALTER TABLE public.branches DISABLE TRIGGER USER;
ALTER TABLE public.warehouses DISABLE TRIGGER USER;
ALTER TABLE public.subscriptions DISABLE TRIGGER USER;
DO $$
DECLARE v_tenant uuid; v_owner uuid := '512a60de-7c19-44f4-9977-8e15e76e37dc';
        v_branch uuid; v_wh uuid; v_sub uuid;
        v_plan uuid := 'eafdd148-c062-46d5-984f-3141a558bc44';
BEGIN
  SELECT id INTO v_tenant FROM public.tenants WHERE lower(name)='nimel pharma' LIMIT 1;

  SELECT id INTO v_branch FROM public.branches WHERE tenant_id=v_tenant AND deleted_at IS NULL LIMIT 1;
  IF v_branch IS NULL THEN
    INSERT INTO public.branches(tenant_id, code, name, is_main, branch_role)
    VALUES (v_tenant,'HQ','Head Office',true,'head_office') RETURNING id INTO v_branch;
  END IF;

  SELECT id INTO v_wh FROM public.warehouses WHERE tenant_id=v_tenant AND deleted_at IS NULL LIMIT 1;
  IF v_wh IS NULL THEN
    INSERT INTO public.warehouses(tenant_id, branch_id, code, name, is_default, is_hq)
    VALUES (v_tenant, v_branch,'MAIN','Main Warehouse',true,true) RETURNING id INTO v_wh;
  END IF;

  INSERT INTO public.branch_settings(tenant_id, branch_id) VALUES (v_tenant, v_branch) ON CONFLICT DO NOTHING;
  INSERT INTO public.tax_profiles(tenant_id, name, rate, type) VALUES (v_tenant,'VAT 0%',0,'standard') ON CONFLICT (tenant_id, name) DO NOTHING;
  INSERT INTO public.number_series_counters(tenant_id, doc_type, current_value)
  VALUES (v_tenant,'invoice',0),(v_tenant,'purchase',0),(v_tenant,'grn',0),(v_tenant,'transfer',0),(v_tenant,'quotation',0)
  ON CONFLICT (tenant_id, doc_type) DO NOTHING;

  SELECT id INTO v_plan FROM public.plans WHERE code = 'enterprise' OR lower(name) = 'enterprise' LIMIT 1;
  IF v_plan IS NULL THEN
    SELECT id INTO v_plan FROM public.plans LIMIT 1;
  END IF;

  SELECT id INTO v_sub FROM public.subscriptions WHERE tenant_id=v_tenant LIMIT 1;
  IF v_sub IS NULL THEN
    INSERT INTO public.subscriptions(tenant_id, plan_id, status, starts_at, current_period_start, current_period_end, expires_at, billing_cycle)
    VALUES (v_tenant, v_plan, 'active', now(), now(), now()+interval '365 days', now()+interval '365 days', 'yearly');
  ELSE
    UPDATE public.subscriptions SET plan_id=v_plan, status='active', current_period_end=now()+interval '365 days', expires_at=now()+interval '365 days' WHERE id=v_sub;
  END IF;

  INSERT INTO public.cash_registers(tenant_id, branch_id, user_id, register_name, opening_amount, status)
  SELECT v_tenant, v_branch, v_owner, 'Main Register', 0, 'open'
  WHERE NOT EXISTS (SELECT 1 FROM public.cash_registers WHERE tenant_id=v_tenant AND user_id=v_owner AND status='open');
END $$;
ALTER TABLE public.branches ENABLE TRIGGER USER;
ALTER TABLE public.warehouses ENABLE TRIGGER USER;
ALTER TABLE public.subscriptions ENABLE TRIGGER USER;