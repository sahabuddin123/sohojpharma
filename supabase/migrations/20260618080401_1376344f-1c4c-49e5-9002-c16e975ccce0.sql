
-- 1. patients: replace ALL policy with explicit write policies scoped to clinical/admin
DROP POLICY IF EXISTS pt_tenant_write ON public.patients;
CREATE POLICY pt_clinical_insert ON public.patients
  FOR INSERT TO authenticated
  WITH CHECK (public.is_clinical_or_admin(auth.uid(), tenant_id) AND tenant_id IS NOT NULL);
CREATE POLICY pt_clinical_update ON public.patients
  FOR UPDATE TO authenticated
  USING (public.is_clinical_or_admin(auth.uid(), tenant_id))
  WITH CHECK (public.is_clinical_or_admin(auth.uid(), tenant_id));
CREATE POLICY pt_clinical_delete ON public.patients
  FOR DELETE TO authenticated
  USING (public.is_manager_or_owner(auth.uid(), tenant_id));

-- 2. attendance: managerial read all, self read own; managerial-only writes
DROP POLICY IF EXISTS att_tenant_all ON public.attendance;
CREATE POLICY att_self_or_mgr_read ON public.attendance
  FOR SELECT TO authenticated
  USING (
    public.is_tenant_member(auth.uid(), tenant_id)
    AND (
      public.is_manager_or_owner(auth.uid(), tenant_id)
      OR staff_id IN (SELECT s.id FROM public.staff s WHERE s.user_id = auth.uid())
    )
  );
CREATE POLICY att_mgr_insert ON public.attendance
  FOR INSERT TO authenticated
  WITH CHECK (public.is_manager_or_owner(auth.uid(), tenant_id));
CREATE POLICY att_mgr_update ON public.attendance
  FOR UPDATE TO authenticated
  USING (public.is_manager_or_owner(auth.uid(), tenant_id))
  WITH CHECK (public.is_manager_or_owner(auth.uid(), tenant_id));
CREATE POLICY att_mgr_delete ON public.attendance
  FOR DELETE TO authenticated
  USING (public.is_manager_or_owner(auth.uid(), tenant_id));

-- 3. Revoke EXECUTE on SECURITY DEFINER helpers from anon/PUBLIC
REVOKE EXECUTE ON FUNCTION public.is_clinical_or_admin(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_manager_or_owner(uuid, uuid) FROM PUBLIC, anon;

-- 4. webhooks: also revoke any anon access defensively
REVOKE ALL ON public.webhooks FROM anon;
