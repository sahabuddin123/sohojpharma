DROP POLICY IF EXISTS gateways_select_member ON public.payment_gateways;
CREATE POLICY gateways_select_privileged ON public.payment_gateways
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), tenant_id, 'owner'::app_role)
  OR public.has_role(auth.uid(), tenant_id, 'corporate_admin'::app_role)
  OR public.has_role(auth.uid(), tenant_id, 'manager'::app_role)
);