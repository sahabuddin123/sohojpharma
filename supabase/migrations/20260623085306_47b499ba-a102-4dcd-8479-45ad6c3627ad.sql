CREATE POLICY "tenants_app_admin_read" ON public.tenants
FOR SELECT TO authenticated
USING (public.is_app_admin(auth.uid()));