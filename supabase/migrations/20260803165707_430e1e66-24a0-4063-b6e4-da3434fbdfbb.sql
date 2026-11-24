DROP POLICY IF EXISTS "members read own tenant payments" ON public.subscription_payments;
CREATE POLICY "owners read own tenant payments" ON public.subscription_payments
FOR SELECT TO authenticated
USING (
  public.is_app_admin(auth.uid())
  OR public.has_role(auth.uid(), tenant_id, 'owner'::app_role)
  OR public.has_role(auth.uid(), tenant_id, 'corporate_admin'::app_role)
);

DROP POLICY IF EXISTS "ura select" ON public.user_role_assignments;
CREATE POLICY "ura select" ON public.user_role_assignments
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_app_admin(auth.uid())
  OR public.has_role(auth.uid(), tenant_id, 'owner'::app_role)
  OR public.has_role(auth.uid(), tenant_id, 'manager'::app_role)
);