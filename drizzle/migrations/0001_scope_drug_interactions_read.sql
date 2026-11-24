DROP POLICY IF EXISTS di_read_auth ON public.drug_interactions;
CREATE POLICY di_read_auth ON public.drug_interactions FOR SELECT TO authenticated
USING (tenant_id IS NULL OR public.is_tenant_member(auth.uid(), tenant_id) OR public.is_app_admin(auth.uid()));