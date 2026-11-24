CREATE POLICY tenants_app_admin_update ON public.tenants FOR UPDATE TO authenticated USING (public.is_app_admin(auth.uid())) WITH CHECK (public.is_app_admin(auth.uid()));

CREATE POLICY audit_log_app_admin_insert ON public.audit_log FOR INSERT TO authenticated WITH CHECK (public.is_app_admin(auth.uid()));