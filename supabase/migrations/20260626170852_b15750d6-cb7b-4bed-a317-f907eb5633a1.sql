
-- 1) batches: replace USING(true) base policy with tenant-scoped policy
DROP POLICY IF EXISTS "batches_permissive_base" ON public.batches;
CREATE POLICY "batches_tenant_member_base"
  ON public.batches
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

-- 2) tenants: drop open INSERT policy; tenants are created via SECURITY DEFINER
--    RPC public.register_pharmacy_store (self-service) or service_role (admin).
DROP POLICY IF EXISTS "tenants_insert_authenticated" ON public.tenants;
CREATE POLICY "tenants_insert_app_admin"
  ON public.tenants
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_app_admin(auth.uid()));

-- 3) SECURITY DEFINER functions: revoke anon execute on non-public ones.
REVOKE EXECUTE ON FUNCTION public.resolve_user_branch(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.update_landing_cms(jsonb, jsonb) FROM anon, public;

-- 4) tenant_access_violations: drop redundant WITH CHECK(true) policy
--    (service_role bypasses RLS, so this policy is dead weight and trips the linter).
DROP POLICY IF EXISTS "tav_service_insert" ON public.tenant_access_violations;
