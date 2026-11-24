
-- Branch hierarchy constraints
ALTER TABLE public.branches
  ADD CONSTRAINT branches_role_check
  CHECK (branch_role IN ('head_office','branch','sub_branch'));

-- Only one head_office per tenant
CREATE UNIQUE INDEX IF NOT EXISTS branches_one_head_office_per_tenant
  ON public.branches(tenant_id)
  WHERE branch_role = 'head_office' AND deleted_at IS NULL;

-- Default branch on membership
ALTER TABLE public.tenant_members
  ADD COLUMN IF NOT EXISTS default_branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;

-- Per-branch settings (overrides tenant defaults)
CREATE TABLE IF NOT EXISTS public.branch_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL UNIQUE REFERENCES public.branches(id) ON DELETE CASCADE,
  address text,
  contact_phone text,
  contact_email text,
  invoice_prefix text,
  printer_profile_id uuid,
  pos_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_settings TO authenticated;
GRANT ALL ON public.branch_settings TO service_role;

ALTER TABLE public.branch_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "branch_settings_tenant_all" ON public.branch_settings
  FOR ALL TO authenticated
  USING (is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (is_tenant_member(auth.uid(), tenant_id));

CREATE TRIGGER trg_branch_settings_updated
  BEFORE UPDATE ON public.branch_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Resolve allowed branches for a user within a tenant.
-- Owner / corporate_admin / auditor / regional_manager => all branches in tenant
-- Others => their default_branch_id only (or all if none set yet, for backward compat)
CREATE OR REPLACE FUNCTION public.user_branch_ids(_user uuid, _tenant uuid)
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.user_role_assignments ura
    JOIN public.roles r ON r.id = ura.role_id
    WHERE ura.user_id = _user
      AND ura.tenant_id = _tenant
      AND r.code IN ('owner','corporate_admin','auditor','regional_manager')
  ) OR EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.user_id = _user AND tm.tenant_id = _tenant
      AND tm.default_branch_id IS NULL
  ) THEN
    RETURN QUERY
      SELECT b.id FROM public.branches b
      WHERE b.tenant_id = _tenant AND b.deleted_at IS NULL;
    RETURN;
  END IF;

  RETURN QUERY
    SELECT tm.default_branch_id
    FROM public.tenant_members tm
    WHERE tm.user_id = _user AND tm.tenant_id = _tenant
      AND tm.default_branch_id IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_branch_access(_user uuid, _branch uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.branches b
    WHERE b.id = _branch
      AND b.id IN (SELECT public.user_branch_ids(_user, b.tenant_id))
  );
$$;

-- Seed missing system roles (idempotent)
INSERT INTO public.roles (tenant_id, code, name, is_system)
VALUES
  (NULL, 'owner', 'Owner', true),
  (NULL, 'corporate_admin', 'Corporate Admin', true),
  (NULL, 'branch_manager', 'Branch Manager', true),
  (NULL, 'pharmacist', 'Pharmacist', true),
  (NULL, 'cashier', 'Cashier', true),
  (NULL, 'auditor', 'Auditor', true)
ON CONFLICT (code) WHERE tenant_id IS NULL DO NOTHING;

-- Mark each tenant's is_main branch as head_office (best-effort backfill)
UPDATE public.branches
SET branch_role = 'head_office'
WHERE is_main = true
  AND branch_role = 'branch'
  AND deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.branches b2
    WHERE b2.tenant_id = branches.tenant_id
      AND b2.branch_role = 'head_office'
      AND b2.deleted_at IS NULL
      AND b2.id <> branches.id
  );
