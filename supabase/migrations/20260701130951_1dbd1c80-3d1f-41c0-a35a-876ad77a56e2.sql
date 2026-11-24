
-- =====================================================
-- Purchase Requisition module
-- =====================================================

-- Status enum
DO $$ BEGIN
  CREATE TYPE public.purchase_requisition_status AS ENUM
    ('draft','pending','approved','rejected','completed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---- purchase_requisitions ----
CREATE TABLE IF NOT EXISTS public.purchase_requisitions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  pr_number         TEXT NOT NULL,
  warehouse_id      UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  supplier_id       UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  requisition_date  DATE NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  expected_date     DATE,
  remarks           TEXT,
  status            public.purchase_requisition_status NOT NULL DEFAULT 'draft',
  total_items       INTEGER NOT NULL DEFAULT 0,
  total_qty         NUMERIC(14,3) NOT NULL DEFAULT 0,
  estimated_amount  NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at       TIMESTAMPTZ,
  rejected_reason   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT purchase_requisitions_tenant_pr_key UNIQUE (tenant_id, pr_number)
);
CREATE INDEX IF NOT EXISTS idx_pr_tenant_date
  ON public.purchase_requisitions (tenant_id, requisition_date DESC);
CREATE INDEX IF NOT EXISTS idx_pr_tenant_status
  ON public.purchase_requisitions (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_pr_supplier
  ON public.purchase_requisitions (tenant_id, supplier_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_requisitions TO authenticated;
GRANT ALL ON public.purchase_requisitions TO service_role;
ALTER TABLE public.purchase_requisitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pr_select_members ON public.purchase_requisitions;
CREATE POLICY pr_select_members ON public.purchase_requisitions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = purchase_requisitions.tenant_id AND tm.user_id = auth.uid()));

DROP POLICY IF EXISTS pr_insert_members ON public.purchase_requisitions;
CREATE POLICY pr_insert_members ON public.purchase_requisitions
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = purchase_requisitions.tenant_id AND tm.user_id = auth.uid()));

DROP POLICY IF EXISTS pr_update_members ON public.purchase_requisitions;
CREATE POLICY pr_update_members ON public.purchase_requisitions
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = purchase_requisitions.tenant_id AND tm.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = purchase_requisitions.tenant_id AND tm.user_id = auth.uid()));

DROP POLICY IF EXISTS pr_delete_members ON public.purchase_requisitions;
CREATE POLICY pr_delete_members ON public.purchase_requisitions
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = purchase_requisitions.tenant_id AND tm.user_id = auth.uid()));

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_pr_updated_at ON public.purchase_requisitions;
CREATE TRIGGER trg_pr_updated_at BEFORE UPDATE ON public.purchase_requisitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---- purchase_requisition_items ----
CREATE TABLE IF NOT EXISTS public.purchase_requisition_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id        UUID NOT NULL REFERENCES public.purchase_requisitions(id) ON DELETE CASCADE,
  tenant_id             UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id            UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name          TEXT NOT NULL,
  sku                   TEXT,
  barcode               TEXT,
  generic_name          TEXT,
  unit                  TEXT,
  current_stock         NUMERIC(14,3) NOT NULL DEFAULT 0,
  reorder_level         NUMERIC(14,3) NOT NULL DEFAULT 0,
  requested_qty         NUMERIC(14,3) NOT NULL DEFAULT 1,
  last_purchase_price   NUMERIC(14,4) NOT NULL DEFAULT 0,
  estimated_cost        NUMERIC(14,2) NOT NULL DEFAULT 0,
  remarks               TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pri_requisition ON public.purchase_requisition_items(requisition_id);
CREATE INDEX IF NOT EXISTS idx_pri_tenant_product ON public.purchase_requisition_items(tenant_id, product_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_requisition_items TO authenticated;
GRANT ALL ON public.purchase_requisition_items TO service_role;
ALTER TABLE public.purchase_requisition_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pri_all_members ON public.purchase_requisition_items;
CREATE POLICY pri_all_members ON public.purchase_requisition_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = purchase_requisition_items.tenant_id AND tm.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = purchase_requisition_items.tenant_id AND tm.user_id = auth.uid()));

-- =====================================================
-- resolve_default_supplier
-- =====================================================
CREATE OR REPLACE FUNCTION public.resolve_default_supplier(_tenant_id UUID)
RETURNS TABLE (id UUID, name TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cfg_id UUID;
BEGIN
  -- prefer explicit tenant_settings.system->>'default_supplier_id'
  SELECT NULLIF(ts.system->>'default_supplier_id','')::uuid INTO cfg_id
    FROM public.tenant_settings ts WHERE ts.tenant_id = _tenant_id;

  IF cfg_id IS NOT NULL THEN
    RETURN QUERY
      SELECT s.id, s.name FROM public.suppliers s
      WHERE s.id = cfg_id AND s.tenant_id = _tenant_id AND s.is_active = true;
    IF FOUND THEN RETURN; END IF;
  END IF;

  RETURN QUERY
    SELECT s.id, s.name FROM public.suppliers s
    WHERE s.tenant_id = _tenant_id AND s.is_active = true
    ORDER BY s.created_at ASC LIMIT 1;
END $$;
REVOKE ALL ON FUNCTION public.resolve_default_supplier(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_default_supplier(UUID) TO authenticated, service_role;

-- =====================================================
-- save_purchase_requisition
-- payload: {
--   id?: uuid, tenant_id: uuid, warehouse_id?: uuid, supplier_id?: uuid,
--   requisition_date?: date, expected_date?: date, remarks?: text,
--   status: 'draft'|'pending', items: [{ product_id, product_name, sku, barcode,
--     generic_name, unit, current_stock, reorder_level, requested_qty,
--     last_purchase_price, remarks }]
-- }
-- =====================================================
CREATE OR REPLACE FUNCTION public.save_purchase_requisition(payload JSONB)
RETURNS public.purchase_requisitions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID := (payload->>'tenant_id')::uuid;
  v_id UUID := NULLIF(payload->>'id','')::uuid;
  v_status public.purchase_requisition_status := COALESCE(NULLIF(payload->>'status','')::public.purchase_requisition_status,'draft');
  v_supplier UUID := NULLIF(payload->>'supplier_id','')::uuid;
  v_warehouse UUID := NULLIF(payload->>'warehouse_id','')::uuid;
  v_req_date DATE := COALESCE((payload->>'requisition_date')::date, (now() AT TIME ZONE 'utc')::date);
  v_exp_date DATE := NULLIF(payload->>'expected_date','')::date;
  v_remarks TEXT := payload->>'remarks';
  v_pr public.purchase_requisitions;
  v_pr_number TEXT;
  v_default_supplier UUID;
  v_items JSONB := COALESCE(payload->'items','[]'::jsonb);
  v_total_items INT := 0;
  v_total_qty NUMERIC(14,3) := 0;
  v_total_amount NUMERIC(14,2) := 0;
  it JSONB;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'tenant_id required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id=v_tenant AND tm.user_id=auth.uid()) THEN
    RAISE EXCEPTION 'Not a member of tenant';
  END IF;

  -- resolve default supplier when null
  IF v_supplier IS NULL THEN
    SELECT id INTO v_default_supplier FROM public.resolve_default_supplier(v_tenant) LIMIT 1;
    v_supplier := v_default_supplier;
  END IF;

  -- totals from items
  FOR it IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_total_items := v_total_items + 1;
    v_total_qty := v_total_qty + COALESCE((it->>'requested_qty')::numeric,0);
    v_total_amount := v_total_amount + (COALESCE((it->>'requested_qty')::numeric,0)
                                        * COALESCE((it->>'last_purchase_price')::numeric,0));
  END LOOP;

  IF v_id IS NULL THEN
    v_pr_number := public.generate_next_number(v_tenant, 'purchase_requisition');
    INSERT INTO public.purchase_requisitions
      (tenant_id, pr_number, warehouse_id, supplier_id, requisition_date, expected_date,
       remarks, status, total_items, total_qty, estimated_amount, created_by)
    VALUES
      (v_tenant, v_pr_number, v_warehouse, v_supplier, v_req_date, v_exp_date,
       v_remarks, v_status, v_total_items, v_total_qty, v_total_amount, auth.uid())
    RETURNING * INTO v_pr;
  ELSE
    UPDATE public.purchase_requisitions SET
      warehouse_id = v_warehouse,
      supplier_id  = v_supplier,
      requisition_date = v_req_date,
      expected_date = v_exp_date,
      remarks = v_remarks,
      status = v_status,
      total_items = v_total_items,
      total_qty = v_total_qty,
      estimated_amount = v_total_amount
    WHERE id = v_id AND tenant_id = v_tenant
    RETURNING * INTO v_pr;

    IF v_pr.id IS NULL THEN RAISE EXCEPTION 'Requisition not found'; END IF;
    DELETE FROM public.purchase_requisition_items WHERE requisition_id = v_pr.id;
  END IF;

  IF jsonb_array_length(v_items) > 0 THEN
    INSERT INTO public.purchase_requisition_items
      (requisition_id, tenant_id, product_id, product_name, sku, barcode, generic_name,
       unit, current_stock, reorder_level, requested_qty, last_purchase_price,
       estimated_cost, remarks)
    SELECT v_pr.id, v_tenant,
      NULLIF(x->>'product_id','')::uuid,
      COALESCE(x->>'product_name',''),
      NULLIF(x->>'sku',''),
      NULLIF(x->>'barcode',''),
      NULLIF(x->>'generic_name',''),
      NULLIF(x->>'unit',''),
      COALESCE((x->>'current_stock')::numeric,0),
      COALESCE((x->>'reorder_level')::numeric,0),
      COALESCE((x->>'requested_qty')::numeric,1),
      COALESCE((x->>'last_purchase_price')::numeric,0),
      COALESCE((x->>'requested_qty')::numeric,0) * COALESCE((x->>'last_purchase_price')::numeric,0),
      NULLIF(x->>'remarks','')
    FROM jsonb_array_elements(v_items) AS x;
  END IF;

  RETURN v_pr;
END $$;
REVOKE ALL ON FUNCTION public.save_purchase_requisition(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_purchase_requisition(JSONB) TO authenticated, service_role;

-- =====================================================
-- list_purchase_requisitions
-- =====================================================
CREATE OR REPLACE FUNCTION public.list_purchase_requisitions(
  _tenant_id UUID,
  _search TEXT DEFAULT NULL,
  _status TEXT DEFAULT NULL,
  _supplier_id UUID DEFAULT NULL,
  _warehouse_id UUID DEFAULT NULL,
  _date_from DATE DEFAULT NULL,
  _date_to DATE DEFAULT NULL,
  _limit INT DEFAULT 50,
  _offset INT DEFAULT 0
) RETURNS TABLE (
  id UUID, pr_number TEXT, requisition_date DATE, expected_date DATE,
  supplier_id UUID, supplier_name TEXT,
  warehouse_id UUID, warehouse_name TEXT,
  status TEXT, total_items INT, total_qty NUMERIC, estimated_amount NUMERIC,
  remarks TEXT, created_by UUID, created_by_email TEXT,
  created_at TIMESTAMPTZ, total_count BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id=_tenant_id AND tm.user_id=auth.uid()) THEN
    RAISE EXCEPTION 'Not a member of tenant';
  END IF;
  RETURN QUERY
  WITH base AS (
    SELECT pr.*, s.name AS s_name, w.name AS w_name, u.email AS u_email,
           COUNT(*) OVER() AS full_count
    FROM public.purchase_requisitions pr
    LEFT JOIN public.suppliers s   ON s.id = pr.supplier_id
    LEFT JOIN public.warehouses w  ON w.id = pr.warehouse_id
    LEFT JOIN auth.users u         ON u.id = pr.created_by
    WHERE pr.tenant_id = _tenant_id
      AND (_status IS NULL OR pr.status::text = _status)
      AND (_supplier_id IS NULL OR pr.supplier_id = _supplier_id)
      AND (_warehouse_id IS NULL OR pr.warehouse_id = _warehouse_id)
      AND (_date_from IS NULL OR pr.requisition_date >= _date_from)
      AND (_date_to IS NULL OR pr.requisition_date <= _date_to)
      AND (
        _search IS NULL OR _search = '' OR
        pr.pr_number ILIKE '%'||_search||'%' OR
        COALESCE(s.name,'') ILIKE '%'||_search||'%' OR
        EXISTS (
          SELECT 1 FROM public.purchase_requisition_items i
          WHERE i.requisition_id = pr.id
            AND (i.product_name ILIKE '%'||_search||'%'
              OR i.sku ILIKE '%'||_search||'%'
              OR i.barcode ILIKE '%'||_search||'%')
        )
      )
    ORDER BY pr.requisition_date DESC, pr.created_at DESC
    LIMIT _limit OFFSET _offset
  )
  SELECT b.id, b.pr_number, b.requisition_date, b.expected_date,
         b.supplier_id, b.s_name,
         b.warehouse_id, b.w_name,
         b.status::text, b.total_items, b.total_qty, b.estimated_amount,
         b.remarks, b.created_by, b.u_email,
         b.created_at, b.full_count
  FROM base b;
END $$;
REVOKE ALL ON FUNCTION public.list_purchase_requisitions(UUID,TEXT,TEXT,UUID,UUID,DATE,DATE,INT,INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_purchase_requisitions(UUID,TEXT,TEXT,UUID,UUID,DATE,DATE,INT,INT) TO authenticated, service_role;

-- =====================================================
-- approve / reject
-- =====================================================
CREATE OR REPLACE FUNCTION public.set_purchase_requisition_status(
  _id UUID, _tenant_id UUID, _status TEXT, _reason TEXT DEFAULT NULL
) RETURNS public.purchase_requisitions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pr public.purchase_requisitions;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id=_tenant_id AND tm.user_id=auth.uid()) THEN
    RAISE EXCEPTION 'Not a member of tenant';
  END IF;
  UPDATE public.purchase_requisitions SET
    status = _status::public.purchase_requisition_status,
    approved_by = CASE WHEN _status IN ('approved','rejected') THEN auth.uid() ELSE approved_by END,
    approved_at = CASE WHEN _status IN ('approved','rejected') THEN now() ELSE approved_at END,
    rejected_reason = CASE WHEN _status = 'rejected' THEN _reason ELSE rejected_reason END
  WHERE id = _id AND tenant_id = _tenant_id
  RETURNING * INTO v_pr;
  IF v_pr.id IS NULL THEN RAISE EXCEPTION 'Requisition not found'; END IF;
  RETURN v_pr;
END $$;
REVOKE ALL ON FUNCTION public.set_purchase_requisition_status(UUID,UUID,TEXT,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_purchase_requisition_status(UUID,UUID,TEXT,TEXT) TO authenticated, service_role;

-- =====================================================
-- SECURITY: prevent tenant self-plan-upgrade
-- =====================================================
CREATE OR REPLACE FUNCTION public.prevent_tenant_plan_self_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Allow service_role / superuser (billing pipeline). Block regular authenticated users.
  IF NEW.plan IS DISTINCT FROM OLD.plan THEN
    IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
      RETURN NEW;
    END IF;
    -- Also allow app admins (privileged internal ops)
    IF EXISTS (SELECT 1 FROM public.app_admins a WHERE a.user_id = auth.uid()) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Plan can only be changed via the billing pipeline';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tenants_prevent_plan_self_update ON public.tenants;
CREATE TRIGGER trg_tenants_prevent_plan_self_update
  BEFORE UPDATE OF plan ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_plan_self_update();
