
-- ============================================================
-- PHASE 2: PRODUCT MASTER ARCHITECTURE
-- All catalog tables are empty (Phase 1 reset) — safe to restructure
-- ============================================================

-- 1) DROP duplicate master tables (canonical tables retained: manufacturers, generics, categories, units)
ALTER TABLE public.products
  DROP COLUMN IF EXISTS product_company_id,
  DROP COLUMN IF EXISTS product_generic_id,
  DROP COLUMN IF EXISTS product_category_id,
  DROP COLUMN IF EXISTS product_unit_id;

DROP TABLE IF EXISTS public.product_companies CASCADE;
DROP TABLE IF EXISTS public.product_generics CASCADE;
DROP TABLE IF EXISTS public.product_categories CASCADE;
DROP TABLE IF EXISTS public.product_units CASCADE;

-- ============================================================
-- 2) NEW MASTER TABLES
-- ============================================================

-- Medicine Types (Tablet, Capsule, Syrup, Injection, etc.)
CREATE TABLE public.medicine_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  name text NOT NULL,
  code text,
  description text,
  status text NOT NULL DEFAULT 'active',
  created_by uuid,
  updated_by uuid,
  deleted_by uuid,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.medicine_types TO authenticated;
GRANT ALL ON public.medicine_types TO service_role;
ALTER TABLE public.medicine_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "medicine_types_tenant_all" ON public.medicine_types FOR ALL TO authenticated
  USING (is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "medicine_types_tenant_not_null" ON public.medicine_types AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id IS NOT NULL) WITH CHECK (tenant_id IS NOT NULL);
CREATE INDEX idx_medicine_types_tenant_name ON public.medicine_types (tenant_id, lower(name)) WHERE deleted_at IS NULL;

-- Dosage Forms (granule, suspension, etc., separate from medicine type when needed)
CREATE TABLE public.dosage_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  name text NOT NULL,
  code text,
  description text,
  status text NOT NULL DEFAULT 'active',
  created_by uuid,
  updated_by uuid,
  deleted_by uuid,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dosage_forms TO authenticated;
GRANT ALL ON public.dosage_forms TO service_role;
ALTER TABLE public.dosage_forms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dosage_forms_tenant_all" ON public.dosage_forms FOR ALL TO authenticated
  USING (is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "dosage_forms_tenant_not_null" ON public.dosage_forms AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id IS NOT NULL) WITH CHECK (tenant_id IS NOT NULL);
CREATE INDEX idx_dosage_forms_tenant_name ON public.dosage_forms (tenant_id, lower(name)) WHERE deleted_at IS NULL;

-- Countries
CREATE TABLE public.countries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  name text NOT NULL,
  iso2 text,
  iso3 text,
  status text NOT NULL DEFAULT 'active',
  created_by uuid,
  updated_by uuid,
  deleted_by uuid,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.countries TO authenticated;
GRANT ALL ON public.countries TO service_role;
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "countries_tenant_all" ON public.countries FOR ALL TO authenticated
  USING (is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "countries_tenant_not_null" ON public.countries AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id IS NOT NULL) WITH CHECK (tenant_id IS NOT NULL);

-- Tax Classes
CREATE TABLE public.tax_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  name text NOT NULL,
  rate numeric(5,2) NOT NULL DEFAULT 0,
  mode text NOT NULL DEFAULT 'exclusive' CHECK (mode IN ('inclusive','exclusive','none')),
  status text NOT NULL DEFAULT 'active',
  created_by uuid,
  updated_by uuid,
  deleted_by uuid,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_classes TO authenticated;
GRANT ALL ON public.tax_classes TO service_role;
ALTER TABLE public.tax_classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tax_classes_tenant_all" ON public.tax_classes FOR ALL TO authenticated
  USING (is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "tax_classes_tenant_not_null" ON public.tax_classes AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id IS NOT NULL) WITH CHECK (tenant_id IS NOT NULL);

-- Therapeutic Classes (optional)
CREATE TABLE public.therapeutic_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  name text NOT NULL,
  code text,
  description text,
  status text NOT NULL DEFAULT 'active',
  created_by uuid,
  updated_by uuid,
  deleted_by uuid,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.therapeutic_classes TO authenticated;
GRANT ALL ON public.therapeutic_classes TO service_role;
ALTER TABLE public.therapeutic_classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "therapeutic_classes_tenant_all" ON public.therapeutic_classes FOR ALL TO authenticated
  USING (is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "therapeutic_classes_tenant_not_null" ON public.therapeutic_classes AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id IS NOT NULL) WITH CHECK (tenant_id IS NOT NULL);

-- updated_at triggers for new masters
CREATE TRIGGER trg_medicine_types_updated BEFORE UPDATE ON public.medicine_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_dosage_forms_updated BEFORE UPDATE ON public.dosage_forms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_countries_updated BEFORE UPDATE ON public.countries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_tax_classes_updated BEFORE UPDATE ON public.tax_classes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_therapeutic_classes_updated BEFORE UPDATE ON public.therapeutic_classes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 3) PRODUCTS — add structured columns + FKs
-- ============================================================
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS medicine_type_id uuid REFERENCES public.medicine_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dosage_form_id uuid REFERENCES public.dosage_forms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tax_class_id uuid REFERENCES public.tax_classes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS country_id uuid REFERENCES public.countries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS therapeutic_class_id uuid REFERENCES public.therapeutic_classes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mrp numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS average_cost numeric(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_stock numeric(14,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rack_number text,
  ADD COLUMN IF NOT EXISTS track_batch boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS track_expiry boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS notes text;

-- ============================================================
-- 4) INDEXES for scale (500k+ products)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_products_medicine_type ON public.products (tenant_id, medicine_type_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_generic ON public.products (tenant_id, generic_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_manufacturer ON public.products (tenant_id, manufacturer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products (tenant_id, category_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_status ON public.products (tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products (tenant_id, sku) WHERE deleted_at IS NULL;
