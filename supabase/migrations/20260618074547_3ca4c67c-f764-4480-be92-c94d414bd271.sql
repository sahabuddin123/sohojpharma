
-- Helper: clinical access (clinical or managerial role)
CREATE OR REPLACE FUNCTION public.is_clinical_or_admin(_user_id uuid, _tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, _tenant_id, 'owner')
      OR public.has_role(_user_id, _tenant_id, 'manager')
      OR public.has_role(_user_id, _tenant_id, 'regional_manager')
      OR public.has_role(_user_id, _tenant_id, 'corporate_admin')
      OR public.has_role(_user_id, _tenant_id, 'pharmacist')
      OR public.has_role(_user_id, _tenant_id, 'auditor')
$$;

-- Helper: managerial-only
CREATE OR REPLACE FUNCTION public.is_manager_or_owner(_user_id uuid, _tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, _tenant_id, 'owner')
      OR public.has_role(_user_id, _tenant_id, 'manager')
      OR public.has_role(_user_id, _tenant_id, 'regional_manager')
      OR public.has_role(_user_id, _tenant_id, 'corporate_admin')
      OR public.has_role(_user_id, _tenant_id, 'auditor')
$$;

-- 1. audit_log: restrict SELECT to managerial/auditor roles
DROP POLICY IF EXISTS audit_tenant_read ON public.audit_log;
CREATE POLICY audit_managerial_read ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.is_manager_or_owner(auth.uid(), tenant_id) OR public.is_app_admin(auth.uid()));

-- 2. clinical_audit: clinical or managerial
DROP POLICY IF EXISTS ca_member_read ON public.clinical_audit;
CREATE POLICY ca_clinical_read ON public.clinical_audit
  FOR SELECT TO authenticated
  USING (public.is_clinical_or_admin(auth.uid(), tenant_id));

-- 3. patients: SELECT restricted to clinical/managerial
DROP POLICY IF EXISTS pt_tenant_select ON public.patients;
CREATE POLICY pt_clinical_select ON public.patients
  FOR SELECT TO authenticated
  USING (public.is_clinical_or_admin(auth.uid(), tenant_id));

-- 4. prescriptions: restrict to clinical/managerial
DROP POLICY IF EXISTS "tenant members manage prescriptions" ON public.prescriptions;
CREATE POLICY presc_clinical_read ON public.prescriptions
  FOR SELECT TO authenticated
  USING (public.is_clinical_or_admin(auth.uid(), tenant_id));
CREATE POLICY presc_clinical_write ON public.prescriptions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_clinical_or_admin(auth.uid(), tenant_id) AND tenant_id IS NOT NULL);
CREATE POLICY presc_clinical_update ON public.prescriptions
  FOR UPDATE TO authenticated
  USING (public.is_clinical_or_admin(auth.uid(), tenant_id))
  WITH CHECK (public.is_clinical_or_admin(auth.uid(), tenant_id));
CREATE POLICY presc_clinical_delete ON public.prescriptions
  FOR DELETE TO authenticated
  USING (public.is_manager_or_owner(auth.uid(), tenant_id));

-- 5. prescription_items: same
DROP POLICY IF EXISTS "tenant members manage prescription items" ON public.prescription_items;
CREATE POLICY presc_items_clinical_read ON public.prescription_items
  FOR SELECT TO authenticated
  USING (public.is_clinical_or_admin(auth.uid(), tenant_id));
CREATE POLICY presc_items_clinical_write ON public.prescription_items
  FOR INSERT TO authenticated
  WITH CHECK (public.is_clinical_or_admin(auth.uid(), tenant_id) AND tenant_id IS NOT NULL);
CREATE POLICY presc_items_clinical_update ON public.prescription_items
  FOR UPDATE TO authenticated
  USING (public.is_clinical_or_admin(auth.uid(), tenant_id))
  WITH CHECK (public.is_clinical_or_admin(auth.uid(), tenant_id));
CREATE POLICY presc_items_clinical_delete ON public.prescription_items
  FOR DELETE TO authenticated
  USING (public.is_manager_or_owner(auth.uid(), tenant_id));

-- 6. staff: split SELECT — self or managerial; writes managerial only
DROP POLICY IF EXISTS staff_tenant_all ON public.staff;
CREATE POLICY staff_self_or_mgr_read ON public.staff
  FOR SELECT TO authenticated
  USING (
    is_tenant_member(auth.uid(), tenant_id)
    AND (user_id = auth.uid() OR public.is_manager_or_owner(auth.uid(), tenant_id))
  );
CREATE POLICY staff_mgr_write ON public.staff
  FOR INSERT TO authenticated
  WITH CHECK (public.is_manager_or_owner(auth.uid(), tenant_id));
CREATE POLICY staff_mgr_update ON public.staff
  FOR UPDATE TO authenticated
  USING (public.is_manager_or_owner(auth.uid(), tenant_id))
  WITH CHECK (public.is_manager_or_owner(auth.uid(), tenant_id));
CREATE POLICY staff_mgr_delete ON public.staff
  FOR DELETE TO authenticated
  USING (public.is_manager_or_owner(auth.uid(), tenant_id));

-- 7. comm_log: managerial only
DROP POLICY IF EXISTS "tenant members read comm_log" ON public.comm_log;
CREATE POLICY comm_log_mgr_read ON public.comm_log
  FOR SELECT TO authenticated
  USING (public.is_manager_or_owner(auth.uid(), tenant_id));

-- 8. webhooks: hide 'secret' column from API (column-level revoke)
REVOKE SELECT ON public.webhooks FROM authenticated;
GRANT SELECT (id, tenant_id, url, events, active, created_by, created_at)
  ON public.webhooks TO authenticated;

-- 9. storage: explicit UPDATE policy for prescriptions bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='tenant members update prescription files'
  ) THEN
    CREATE POLICY "tenant members update prescription files"
      ON storage.objects FOR UPDATE TO authenticated
      USING (
        bucket_id = 'prescriptions'
        AND (storage.foldername(name))[1]::uuid IN (
          SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
        )
      )
      WITH CHECK (
        bucket_id = 'prescriptions'
        AND (storage.foldername(name))[1]::uuid IN (
          SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- 10. tenant_access_violations: allow app admins to read null-tenant records
CREATE POLICY tav_app_admin_read ON public.tenant_access_violations
  FOR SELECT TO authenticated
  USING (public.is_app_admin(auth.uid()));
