
CREATE OR REPLACE FUNCTION public.tenant_usage_summary(_tenant uuid)
RETURNS TABLE(metric text, current_usage numeric, limit_value numeric, usage_percent numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plan_id uuid;
  v_plan public.plans%ROWTYPE;
  v_period_start date := date_trunc('month', now())::date;
  v_products numeric := 0; v_users numeric := 0;
  v_branches numeric := 0; v_warehouses numeric := 0;
  v_storage numeric := 0; v_api numeric := 0;
BEGIN
  IF NOT COALESCE(public.is_app_admin(auth.uid()), false) THEN
    IF NOT EXISTS (SELECT 1 FROM public.tenant_members WHERE tenant_id=_tenant AND user_id=auth.uid()) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
    END IF;
  END IF;

  SELECT plan_id INTO v_plan_id FROM public.subscriptions
    WHERE tenant_id=_tenant ORDER BY updated_at DESC LIMIT 1;
  IF v_plan_id IS NOT NULL THEN
    SELECT * INTO v_plan FROM public.plans WHERE id=v_plan_id;
  END IF;

  SELECT count(*) INTO v_products   FROM public.products       WHERE tenant_id=_tenant;
  SELECT count(*) INTO v_users      FROM public.tenant_members WHERE tenant_id=_tenant;
  SELECT count(*) INTO v_branches   FROM public.branches       WHERE tenant_id=_tenant;
  SELECT count(*) INTO v_warehouses FROM public.warehouses     WHERE tenant_id=_tenant;
  SELECT COALESCE(value,0) INTO v_storage FROM public.usage_metering
    WHERE tenant_id=_tenant AND metric='storage_mb' AND period_start=v_period_start;
  SELECT COALESCE(value,0) INTO v_api FROM public.usage_metering
    WHERE tenant_id=_tenant AND metric='api_requests' AND period_start=v_period_start;

  RETURN QUERY
  SELECT t.metric, t.current_usage, t.limit_value,
         CASE
           WHEN COALESCE(v_plan.is_unlimited,false) OR t.limit_value IS NULL THEN 0::numeric
           WHEN t.limit_value = 0 THEN 100::numeric
           ELSE round( (t.current_usage / t.limit_value * 100)::numeric, 2)
         END AS usage_percent
  FROM (VALUES
    ('products',     v_products,   v_plan.max_products::numeric),
    ('users',        v_users,      v_plan.max_users::numeric),
    ('branches',     v_branches,   v_plan.max_branches::numeric),
    ('warehouses',   v_warehouses, v_plan.max_warehouses::numeric),
    ('storage_mb',   v_storage,    v_plan.max_storage_mb::numeric),
    ('api_requests', v_api,        v_plan.max_api_requests_per_month::numeric)
  ) AS t(metric, current_usage, limit_value);
END $$;

GRANT EXECUTE ON FUNCTION public.tenant_usage_summary(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_tenant_limit(_tenant uuid, _metric text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_row record;
BEGIN
  SELECT * INTO v_row FROM public.tenant_usage_summary(_tenant) WHERE metric=_metric;
  IF v_row.limit_value IS NULL THEN RETURN; END IF;
  IF v_row.current_usage >= v_row.limit_value THEN
    RAISE EXCEPTION 'Plan limit reached for % (% / %). Upgrade your subscription.',
      _metric, v_row.current_usage, v_row.limit_value
      USING ERRCODE='check_violation';
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.enforce_tenant_limit(uuid,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tg_enforce_limit_products() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN PERFORM public.enforce_tenant_limit(NEW.tenant_id,'products'); RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION public.tg_enforce_limit_users() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN PERFORM public.enforce_tenant_limit(NEW.tenant_id,'users'); RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION public.tg_enforce_limit_branches() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN PERFORM public.enforce_tenant_limit(NEW.tenant_id,'branches'); RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION public.tg_enforce_limit_warehouses() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN PERFORM public.enforce_tenant_limit(NEW.tenant_id,'warehouses'); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_limit_products   ON public.products;
DROP TRIGGER IF EXISTS trg_limit_users      ON public.tenant_members;
DROP TRIGGER IF EXISTS trg_limit_branches   ON public.branches;
DROP TRIGGER IF EXISTS trg_limit_warehouses ON public.warehouses;

CREATE TRIGGER trg_limit_products   BEFORE INSERT ON public.products       FOR EACH ROW EXECUTE FUNCTION public.tg_enforce_limit_products();
CREATE TRIGGER trg_limit_users      BEFORE INSERT ON public.tenant_members FOR EACH ROW EXECUTE FUNCTION public.tg_enforce_limit_users();
CREATE TRIGGER trg_limit_branches   BEFORE INSERT ON public.branches       FOR EACH ROW EXECUTE FUNCTION public.tg_enforce_limit_branches();
CREATE TRIGGER trg_limit_warehouses BEFORE INSERT ON public.warehouses     FOR EACH ROW EXECUTE FUNCTION public.tg_enforce_limit_warehouses();

CREATE OR REPLACE FUNCTION public.record_api_request(_tenant uuid, _n integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_period_start date := date_trunc('month', now())::date;
  v_period_end   date := (date_trunc('month', now()) + interval '1 month - 1 day')::date;
  v_limit numeric; v_value numeric;
BEGIN
  SELECT limit_value INTO v_limit FROM public.tenant_usage_summary(_tenant) WHERE metric='api_requests';
  INSERT INTO public.usage_metering(tenant_id,metric,value,period_start,period_end)
    VALUES (_tenant,'api_requests',_n,v_period_start,v_period_end)
    ON CONFLICT (tenant_id,metric,period_start)
    DO UPDATE SET value=public.usage_metering.value + EXCLUDED.value, updated_at=now()
    RETURNING value INTO v_value;
  IF v_limit IS NOT NULL AND v_value > v_limit THEN
    RAISE EXCEPTION 'API request limit reached (% / %). Upgrade your subscription.', v_value, v_limit
      USING ERRCODE='check_violation';
  END IF;
  RETURN jsonb_build_object('value',v_value,'limit',v_limit);
END $$;
GRANT EXECUTE ON FUNCTION public.record_api_request(uuid,integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_storage_usage(_tenant uuid, _mb numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_period_start date := date_trunc('month', now())::date;
  v_period_end   date := (date_trunc('month', now()) + interval '1 month - 1 day')::date;
  v_limit numeric; v_value numeric;
BEGIN
  SELECT limit_value INTO v_limit FROM public.tenant_usage_summary(_tenant) WHERE metric='storage_mb';
  INSERT INTO public.usage_metering(tenant_id,metric,value,period_start,period_end)
    VALUES (_tenant,'storage_mb',GREATEST(_mb,0),v_period_start,v_period_end)
    ON CONFLICT (tenant_id,metric,period_start)
    DO UPDATE SET value=GREATEST(EXCLUDED.value,0), updated_at=now()
    RETURNING value INTO v_value;
  IF v_limit IS NOT NULL AND v_value > v_limit THEN
    RAISE EXCEPTION 'Storage limit reached (% MB / % MB). Upgrade your subscription.', v_value, v_limit
      USING ERRCODE='check_violation';
  END IF;
  RETURN jsonb_build_object('value',v_value,'limit',v_limit);
END $$;
GRANT EXECUTE ON FUNCTION public.record_storage_usage(uuid,numeric) TO authenticated, service_role;
