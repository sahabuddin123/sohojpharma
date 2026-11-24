CREATE OR REPLACE FUNCTION public.is_branch_admin(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, _tenant_id, 'owner')
      OR public.has_role(_user_id, _tenant_id, 'manager')
      OR public.has_role(_user_id, _tenant_id, 'regional_manager')
      OR public.has_role(_user_id, _tenant_id, 'corporate_admin')
$$;

CREATE OR REPLACE FUNCTION public.user_can_access_branch(_tenant_id uuid, _branch_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RETURN false;
  END IF;

  IF _branch_id IS NULL THEN
    RETURN true;
  END IF;

  IF public.is_branch_admin(auth.uid(), _tenant_id) THEN
    RETURN true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.tenant_id = _tenant_id
      AND s.user_id = auth.uid()
      AND s.branch_id IS NOT NULL
      AND COALESCE(s.status, 'active') <> 'inactive'
  ) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.tenant_id = _tenant_id
      AND s.user_id = auth.uid()
      AND s.branch_id = _branch_id
      AND COALESCE(s.status, 'active') <> 'inactive'
  );
END;
$$;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS medicine_type text,
  ADD COLUMN IF NOT EXISTS strength text,
  ADD COLUMN IF NOT EXISTS volume text,
  ADD COLUMN IF NOT EXISTS country_of_origin text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS qty_per_box numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

ALTER TABLE public.manufacturers
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS deleted_by uuid,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.generics
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS deleted_by uuid,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.batches
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS deleted_by uuid,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_products_tenant_branch ON public.products(tenant_id, branch_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_barcode_search ON public.products(tenant_id, branch_id, barcode) WHERE barcode IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_name_company_search ON public.products(tenant_id, branch_id, lower(name), manufacturer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_manufacturers_tenant_branch_name ON public.manufacturers(tenant_id, branch_id, lower(name)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_generics_tenant_branch_name ON public.generics(tenant_id, branch_id, lower(name)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_batches_tenant_branch_expiry ON public.batches(tenant_id, branch_id, expiry_date) WHERE deleted_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='products' AND policyname='products_branch_scope') THEN
    EXECUTE 'CREATE POLICY products_branch_scope ON public.products AS RESTRICTIVE FOR ALL TO authenticated USING (public.user_can_access_branch(tenant_id, branch_id) AND deleted_at IS NULL) WITH CHECK (public.user_can_access_branch(tenant_id, branch_id))';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='manufacturers' AND policyname='manufacturers_branch_scope') THEN
    EXECUTE 'CREATE POLICY manufacturers_branch_scope ON public.manufacturers AS RESTRICTIVE FOR ALL TO authenticated USING (public.user_can_access_branch(tenant_id, branch_id) AND deleted_at IS NULL) WITH CHECK (public.user_can_access_branch(tenant_id, branch_id))';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='generics' AND policyname='generics_branch_scope') THEN
    EXECUTE 'CREATE POLICY generics_branch_scope ON public.generics AS RESTRICTIVE FOR ALL TO authenticated USING (public.user_can_access_branch(tenant_id, branch_id) AND deleted_at IS NULL) WITH CHECK (public.user_can_access_branch(tenant_id, branch_id))';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='batches' AND policyname='batches_branch_scope') THEN
    EXECUTE 'CREATE POLICY batches_branch_scope ON public.batches AS RESTRICTIVE FOR ALL TO authenticated USING (public.user_can_access_branch(tenant_id, branch_id) AND deleted_at IS NULL) WITH CHECK (public.user_can_access_branch(tenant_id, branch_id))';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.product_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  name text NOT NULL,
  code text,
  country text,
  address text,
  phone text,
  email text,
  status text NOT NULL DEFAULT 'active',
  created_by uuid,
  updated_by uuid,
  deleted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT product_companies_status_check CHECK (status IN ('active','inactive'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_companies TO authenticated;
GRANT ALL ON public.product_companies TO service_role;
ALTER TABLE public.product_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_companies_tenant_branch_all ON public.product_companies FOR ALL TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id) AND public.user_can_access_branch(tenant_id, branch_id) AND deleted_at IS NULL) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id) AND public.user_can_access_branch(tenant_id, branch_id));

CREATE TABLE IF NOT EXISTS public.product_generics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  generic_name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active',
  created_by uuid,
  updated_by uuid,
  deleted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT product_generics_status_check CHECK (status IN ('active','inactive'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_generics TO authenticated;
GRANT ALL ON public.product_generics TO service_role;
ALTER TABLE public.product_generics ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_generics_tenant_branch_all ON public.product_generics FOR ALL TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id) AND public.user_can_access_branch(tenant_id, branch_id) AND deleted_at IS NULL) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id) AND public.user_can_access_branch(tenant_id, branch_id));

CREATE TABLE IF NOT EXISTS public.product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active',
  created_by uuid,
  updated_by uuid,
  deleted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT product_categories_status_check CHECK (status IN ('active','inactive'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_categories TO authenticated;
GRANT ALL ON public.product_categories TO service_role;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_categories_tenant_branch_all ON public.product_categories FOR ALL TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id) AND public.user_can_access_branch(tenant_id, branch_id) AND deleted_at IS NULL) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id) AND public.user_can_access_branch(tenant_id, branch_id));

CREATE TABLE IF NOT EXISTS public.product_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  name text NOT NULL,
  code text NOT NULL,
  is_base boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  created_by uuid,
  updated_by uuid,
  deleted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT product_units_status_check CHECK (status IN ('active','inactive'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_units TO authenticated;
GRANT ALL ON public.product_units TO service_role;
ALTER TABLE public.product_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_units_tenant_branch_all ON public.product_units FOR ALL TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id) AND public.user_can_access_branch(tenant_id, branch_id) AND deleted_at IS NULL) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id) AND public.user_can_access_branch(tenant_id, branch_id));

CREATE TABLE IF NOT EXISTS public.product_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  batch_no text NOT NULL,
  mfg_date date,
  expiry_date date,
  purchase_price numeric NOT NULL DEFAULT 0,
  sale_price numeric NOT NULL DEFAULT 0,
  opening_stock numeric NOT NULL DEFAULT 0,
  qty_on_hand numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_by uuid,
  updated_by uuid,
  deleted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT product_batches_status_check CHECK (status IN ('active','inactive','expired'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_batches TO authenticated;
GRANT ALL ON public.product_batches TO service_role;
ALTER TABLE public.product_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_batches_tenant_branch_all ON public.product_batches FOR ALL TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id) AND public.user_can_access_branch(tenant_id, branch_id) AND deleted_at IS NULL) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id) AND public.user_can_access_branch(tenant_id, branch_id));

CREATE TABLE IF NOT EXISTS public.product_barcodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  barcode text NOT NULL,
  barcode_type text NOT NULL DEFAULT 'Code128',
  label_size text,
  is_primary boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  created_by uuid,
  updated_by uuid,
  deleted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT product_barcodes_type_check CHECK (barcode_type IN ('Code128','EAN13','QR')),
  CONSTRAINT product_barcodes_status_check CHECK (status IN ('active','inactive'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_barcodes TO authenticated;
GRANT ALL ON public.product_barcodes TO service_role;
ALTER TABLE public.product_barcodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_barcodes_tenant_branch_all ON public.product_barcodes FOR ALL TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id) AND public.user_can_access_branch(tenant_id, branch_id) AND deleted_at IS NULL) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id) AND public.user_can_access_branch(tenant_id, branch_id));

CREATE TABLE IF NOT EXISTS public.product_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  batch_id uuid REFERENCES public.product_batches(id) ON DELETE SET NULL,
  opening_stock numeric NOT NULL DEFAULT 0,
  qty_on_hand numeric NOT NULL DEFAULT 0,
  reorder_level numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_by uuid,
  updated_by uuid,
  deleted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT product_stock_status_check CHECK (status IN ('active','inactive'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_stock TO authenticated;
GRANT ALL ON public.product_stock TO service_role;
ALTER TABLE public.product_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_stock_tenant_branch_all ON public.product_stock FOR ALL TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id) AND public.user_can_access_branch(tenant_id, branch_id) AND deleted_at IS NULL) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id) AND public.user_can_access_branch(tenant_id, branch_id));

CREATE TABLE IF NOT EXISTS public.product_import_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  total_rows integer NOT NULL DEFAULT 0,
  imported_rows integer NOT NULL DEFAULT 0,
  updated_rows integer NOT NULL DEFAULT 0,
  failed_rows integer NOT NULL DEFAULT 0,
  skipped_rows integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'processing',
  created_by uuid,
  updated_by uuid,
  deleted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT product_import_logs_status_check CHECK (status IN ('processing','completed','failed'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_import_logs TO authenticated;
GRANT ALL ON public.product_import_logs TO service_role;
ALTER TABLE public.product_import_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_import_logs_tenant_branch_all ON public.product_import_logs FOR ALL TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id) AND public.user_can_access_branch(tenant_id, branch_id) AND deleted_at IS NULL) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id) AND public.user_can_access_branch(tenant_id, branch_id));

CREATE TABLE IF NOT EXISTS public.product_import_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  import_log_id uuid NOT NULL REFERENCES public.product_import_logs(id) ON DELETE CASCADE,
  row_number integer NOT NULL,
  product_name text,
  company_name text,
  barcode text,
  error_message text NOT NULL,
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_import_errors TO authenticated;
GRANT ALL ON public.product_import_errors TO service_role;
ALTER TABLE public.product_import_errors ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_import_errors_tenant_branch_all ON public.product_import_errors FOR ALL TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id) AND public.user_can_access_branch(tenant_id, branch_id)) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id) AND public.user_can_access_branch(tenant_id, branch_id));

CREATE TABLE IF NOT EXISTS public.requisitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  from_branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  to_branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  requisition_no text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  notes text,
  approved_by uuid,
  approved_at timestamptz,
  rejected_by uuid,
  rejected_at timestamptz,
  received_by uuid,
  received_at timestamptz,
  created_by uuid,
  updated_by uuid,
  deleted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT requisitions_status_check CHECK (status IN ('draft','pending','approved','received','cancelled','rejected'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.requisitions TO authenticated;
GRANT ALL ON public.requisitions TO service_role;
ALTER TABLE public.requisitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY requisitions_tenant_branch_all ON public.requisitions FOR ALL TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id) AND (public.user_can_access_branch(tenant_id, branch_id) OR public.user_can_access_branch(tenant_id, from_branch_id) OR public.user_can_access_branch(tenant_id, to_branch_id)) AND deleted_at IS NULL) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id) AND (public.user_can_access_branch(tenant_id, branch_id) OR public.user_can_access_branch(tenant_id, from_branch_id) OR public.user_can_access_branch(tenant_id, to_branch_id)));

CREATE TABLE IF NOT EXISTS public.requisition_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  requisition_id uuid NOT NULL REFERENCES public.requisitions(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  requested_qty numeric NOT NULL DEFAULT 0,
  approved_qty numeric NOT NULL DEFAULT 0,
  received_qty numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  updated_by uuid,
  deleted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.requisition_items TO authenticated;
GRANT ALL ON public.requisition_items TO service_role;
ALTER TABLE public.requisition_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY requisition_items_tenant_branch_all ON public.requisition_items FOR ALL TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id) AND public.user_can_access_branch(tenant_id, branch_id) AND deleted_at IS NULL) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id) AND public.user_can_access_branch(tenant_id, branch_id));

CREATE TABLE IF NOT EXISTS public.requisition_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  requisition_id uuid NOT NULL REFERENCES public.requisitions(id) ON DELETE CASCADE,
  action text NOT NULL,
  status_from text,
  status_to text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.requisition_records TO authenticated;
GRANT ALL ON public.requisition_records TO service_role;
ALTER TABLE public.requisition_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY requisition_records_tenant_branch_all ON public.requisition_records FOR ALL TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id) AND public.user_can_access_branch(tenant_id, branch_id)) WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id) AND public.user_can_access_branch(tenant_id, branch_id));

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_company_id uuid REFERENCES public.product_companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS product_generic_id uuid REFERENCES public.product_generics(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS product_category_id uuid REFERENCES public.product_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS product_unit_id uuid REFERENCES public.product_units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_product_companies_search ON public.product_companies(tenant_id, branch_id, lower(name)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_product_generics_search ON public.product_generics(tenant_id, branch_id, lower(generic_name)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_product_categories_search ON public.product_categories(tenant_id, branch_id, lower(name)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_product_units_search ON public.product_units(tenant_id, branch_id, lower(code)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_product_batches_expiry ON public.product_batches(tenant_id, branch_id, expiry_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_product_barcodes_lookup ON public.product_barcodes(tenant_id, branch_id, barcode) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_product_stock_lookup ON public.product_stock(tenant_id, branch_id, product_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_product_import_errors_log ON public.product_import_errors(import_log_id, row_number);
CREATE INDEX IF NOT EXISTS idx_requisitions_filter ON public.requisitions(tenant_id, branch_id, status, created_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_requisition_items_req ON public.requisition_items(requisition_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_requisition_records_filter ON public.requisition_records(tenant_id, branch_id, created_at);

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['product_companies','product_generics','product_categories','product_units','product_batches','product_barcodes','product_stock','product_import_logs','requisitions','requisition_items'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_%I_updated_at ON public.%I', tbl, tbl);
    EXECUTE format('CREATE TRIGGER set_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', tbl, tbl);
  END LOOP;
END $$;