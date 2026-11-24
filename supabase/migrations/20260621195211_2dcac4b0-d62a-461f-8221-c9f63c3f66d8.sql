
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.subscriptions'::regclass AND conname='subscriptions_tenant_id_key') THEN
    ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_tenant_id_key UNIQUE (tenant_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.is_tenant_owner_or_admin(_tenant uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_app_admin(auth.uid())
      OR EXISTS (SELECT 1 FROM public.tenant_members m WHERE m.tenant_id = _tenant AND m.user_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.is_tenant_owner_or_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_tenant_owner_or_admin(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.renew_subscription(_tenant uuid, _months int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sub_id uuid; v_plan_id uuid; v_cycle text; v_price numeric; v_yearly numeric; v_amount numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_tenant_owner_or_admin(_tenant) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
  END IF;
  IF _months IS NULL OR _months < 1 OR _months > 36 THEN
    RAISE EXCEPTION 'Invalid months' USING ERRCODE='22023';
  END IF;
  SELECT s.id, s.plan_id, s.billing_cycle, p.price_bdt, p.price_yearly_bdt
    INTO v_sub_id, v_plan_id, v_cycle, v_price, v_yearly
    FROM public.subscriptions s JOIN public.plans p ON p.id = s.plan_id
    WHERE s.tenant_id = _tenant;
  IF v_sub_id IS NULL THEN RAISE EXCEPTION 'No subscription' USING ERRCODE='P0002'; END IF;
  UPDATE public.subscriptions
    SET expires_at = GREATEST(COALESCE(expires_at, now()), now()) + make_interval(months => _months),
        grace_until = GREATEST(COALESCE(expires_at, now()), now()) + make_interval(months => _months) + interval '7 days',
        status = 'active', updated_at = now()
    WHERE id = v_sub_id;
  v_amount := CASE WHEN v_cycle = 'yearly'
                   THEN COALESCE(v_yearly, v_price * 12) / 12.0 * _months
                   ELSE COALESCE(v_price, 0) * _months END;
  INSERT INTO public.payment_transactions
    (tenant_id, subscription_id, plan_id, amount, currency, provider, status, paid_at, metadata)
  VALUES (_tenant, v_sub_id, v_plan_id, v_amount, 'BDT', 'manual', 'success', now(),
     jsonb_build_object('kind','renewal','months',_months));
END $$;

CREATE OR REPLACE FUNCTION public.downgrade_plan(_tenant uuid, _plan uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_max_b int; v_max_w int; v_max_u int; v_unlimited boolean;
        v_cnt_b int; v_cnt_w int; v_cnt_u int;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_tenant_owner_or_admin(_tenant) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
  END IF;
  SELECT is_unlimited, max_branches, max_warehouses, max_users
    INTO v_unlimited, v_max_b, v_max_w, v_max_u FROM public.plans WHERE id = _plan;
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

CREATE OR REPLACE FUNCTION public.upgrade_plan(_tenant uuid, _plan uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_tenant_owner_or_admin(_tenant) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
  END IF;
  UPDATE public.subscriptions SET plan_id = _plan, status = 'active', updated_at = now() WHERE tenant_id = _tenant;
END $$;
REVOKE ALL ON FUNCTION public.upgrade_plan(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upgrade_plan(uuid, uuid) TO authenticated;

INSERT INTO public.subscriptions (tenant_id, plan_id, status, billing_cycle, starts_at, expires_at, grace_until, auto_renew)
SELECT t.id,
       (SELECT id FROM public.plans WHERE is_active=true ORDER BY COALESCE(sort_order,999), price_bdt NULLS LAST LIMIT 1),
       'trial', 'monthly', now(), now() + interval '15 days', now() + interval '15 days', false
FROM public.tenants t
WHERE NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.tenant_id = t.id)
  AND EXISTS (SELECT 1 FROM public.plans WHERE is_active=true);
