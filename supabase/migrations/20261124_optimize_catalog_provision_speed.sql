-- Migration: 20261124_optimize_catalog_provision_speed.sql
-- Optimizes audit and limit triggers during bulk catalog provisioning

CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant   uuid;
  v_entity   uuid;
  v_action   text;
  v_before   jsonb;
  v_after    jsonb;
BEGIN
  -- Skip during bulk replica provisioning
  IF current_setting('session_replication_role', true) = 'replica' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_after  := to_jsonb(NEW); v_before := NULL;
    v_action := TG_TABLE_NAME || '.create';
    v_entity := (NEW).id; v_tenant := (NEW).tenant_id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_before := to_jsonb(OLD); v_after := to_jsonb(NEW);
    v_action := TG_TABLE_NAME || '.update';
    v_entity := (NEW).id; v_tenant := (NEW).tenant_id;
  ELSE -- DELETE
    v_before := to_jsonb(OLD); v_after := NULL;
    v_action := TG_TABLE_NAME || '.delete';
    v_entity := (OLD).id; v_tenant := (OLD).tenant_id;
  END IF;

  INSERT INTO public.audit_log(
    tenant_id, user_id, action, entity_table, entity_id, before_data, after_data
  ) VALUES (
    v_tenant, auth.uid(), v_action, TG_TABLE_NAME, v_entity, v_before, v_after
  );

  RETURN COALESCE(NEW, OLD);
END $$;

-- Drop duplicate audit trigger on products
DROP TRIGGER IF EXISTS trg_audit_products ON public.products;

-- Optimize product limit triggers
CREATE OR REPLACE FUNCTION public.enforce_product_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_max int;
  v_count int;
  v_plan text;
BEGIN
  IF current_setting('session_replication_role', true) = 'replica' THEN
    RETURN NEW;
  END IF;

  SELECT c.max_products, c.plan_code INTO v_max, v_plan
  FROM public.get_tenant_product_capacity(NEW.tenant_id) c
  LIMIT 1;

  IF v_max IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.products
  WHERE tenant_id = NEW.tenant_id
    AND deleted_at IS NULL;

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'plan_limit_exceeded: plan % allows max % products (current=%)', COALESCE(v_plan, 'current'), v_max, v_count
      USING ERRCODE='P0001', HINT='Upgrade your subscription plan to add more products';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_enforce_products_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF current_setting('session_replication_role', true) = 'replica' THEN
    RETURN NEW;
  END IF;
  PERFORM public.enforce_tenant_limit(NEW.tenant_id, 'products');
  RETURN NEW;
END;
$$;
