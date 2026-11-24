
-- 1. leads: admin-only SELECT/UPDATE/DELETE
CREATE POLICY "Admins read leads" ON public.leads
  FOR SELECT TO authenticated
  USING (public.is_app_admin(auth.uid()));

CREATE POLICY "Admins update leads" ON public.leads
  FOR UPDATE TO authenticated
  USING (public.is_app_admin(auth.uid()))
  WITH CHECK (public.is_app_admin(auth.uid()));

CREATE POLICY "Admins delete leads" ON public.leads
  FOR DELETE TO authenticated
  USING (public.is_app_admin(auth.uid()));

-- 2. subscription-proofs storage: UPDATE + DELETE for tenant member or admin
CREATE POLICY "subproofs update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'subscription-proofs'
    AND (public.is_app_admin(auth.uid())
         OR public.is_tenant_member(auth.uid(), ((string_to_array(name,'/'))[1])::uuid))
  )
  WITH CHECK (
    bucket_id = 'subscription-proofs'
    AND (public.is_app_admin(auth.uid())
         OR public.is_tenant_member(auth.uid(), ((string_to_array(name,'/'))[1])::uuid))
  );

CREATE POLICY "subproofs delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'subscription-proofs'
    AND (public.is_app_admin(auth.uid())
         OR public.is_tenant_member(auth.uid(), ((string_to_array(name,'/'))[1])::uuid))
  );

-- 3. tenant_access_violations: allow authenticated inserts (only for own user_id) + service_role
CREATE POLICY "tav_self_insert" ON public.tenant_access_violations
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "tav_service_insert" ON public.tenant_access_violations
  FOR INSERT TO service_role
  WITH CHECK (true);
