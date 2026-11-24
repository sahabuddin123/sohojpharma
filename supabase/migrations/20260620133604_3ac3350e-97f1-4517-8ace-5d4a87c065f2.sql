
-- Phase S2.3 Pharmacy Profile: extend tenants with identity fields and allow corporate_admin updates
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS business_type text,
  ADD COLUMN IF NOT EXISTS trade_license_no text,
  ADD COLUMN IF NOT EXISTS drug_license_no text,
  ADD COLUMN IF NOT EXISTS bin text,
  ADD COLUMN IF NOT EXISTS tin text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS mobile text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS address_line text,
  ADD COLUMN IF NOT EXISTS area text,
  ADD COLUMN IF NOT EXISTS district text,
  ADD COLUMN IF NOT EXISTS division text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS owner_name text,
  ADD COLUMN IF NOT EXISTS manager_name text,
  ADD COLUMN IF NOT EXISTS opening_date date,
  ADD COLUMN IF NOT EXISTS receipt_logo_url text,
  ADD COLUMN IF NOT EXISTS profile_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS profile_updated_by uuid;

DROP POLICY IF EXISTS tenants_admin_update ON public.tenants;
CREATE POLICY tenants_admin_update ON public.tenants
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), id, 'corporate_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), id, 'corporate_admin'::app_role));
