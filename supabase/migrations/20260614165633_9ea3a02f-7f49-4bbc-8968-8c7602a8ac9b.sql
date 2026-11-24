
-- Tighten tenants insert: only authenticated users, slug check stays simple
DROP POLICY IF EXISTS "tenants_insert_self" ON public.tenants;
CREATE POLICY "tenants_insert_authenticated" ON public.tenants
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

-- Lock down SECURITY DEFINER helpers (called only inside policies / triggers)
REVOKE EXECUTE ON FUNCTION public.is_tenant_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
