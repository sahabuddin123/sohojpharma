
-- 1) Add tax jsonb column to tenant_settings
ALTER TABLE public.tenant_settings
  ADD COLUMN IF NOT EXISTS tax jsonb NOT NULL DEFAULT jsonb_build_object(
    'vat_enabled', true,
    'default_sales_vat', 15,
    'default_purchase_vat', 15,
    'price_includes_vat', false,
    'show_vat_on_invoice', true,
    'show_vat_registration', true,
    'show_bin', true,
    'enable_multi_tax', false,
    'rounding_method', 'nearest',
    'tax_exempt_sales', false,
    'tax_exempt_purchases', false
  );

-- 2) tax_profiles table
CREATE TABLE IF NOT EXISTS public.tax_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  rate numeric(6,3) NOT NULL DEFAULT 0,
  type text NOT NULL DEFAULT 'standard',  -- standard | zero | exempt | reduced
  status text NOT NULL DEFAULT 'active',  -- active | inactive
  description text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_profiles TO authenticated;
GRANT ALL ON public.tax_profiles TO service_role;

ALTER TABLE public.tax_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tax_profiles_select_member"
  ON public.tax_profiles FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tenant_members tm
                 WHERE tm.tenant_id = tax_profiles.tenant_id
                   AND tm.user_id = auth.uid()));

CREATE POLICY "tax_profiles_write_admin"
  ON public.tax_profiles FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), tenant_id, 'owner')
    OR public.has_role(auth.uid(), tenant_id, 'corporate_admin')
    OR public.has_role(auth.uid(), tenant_id, 'manager')
  )
  WITH CHECK (
    public.has_role(auth.uid(), tenant_id, 'owner')
    OR public.has_role(auth.uid(), tenant_id, 'corporate_admin')
    OR public.has_role(auth.uid(), tenant_id, 'manager')
  );

CREATE OR REPLACE FUNCTION public.touch_tax_profiles_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;$$;

DROP TRIGGER IF EXISTS trg_tax_profiles_touch ON public.tax_profiles;
CREATE TRIGGER trg_tax_profiles_touch
  BEFORE UPDATE ON public.tax_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_tax_profiles_updated_at();
