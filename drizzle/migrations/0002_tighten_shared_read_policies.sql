DROP POLICY IF EXISTS tb_anon_read ON public.tenant_branding;

DROP POLICY IF EXISTS st_read_all ON public.sms_templates;

DROP POLICY IF EXISTS "permissions readable by authenticated" ON public.permissions;
CREATE POLICY "permissions readable by members" ON public.permissions FOR SELECT TO authenticated
USING (public.is_app_admin(auth.uid()) OR EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.user_id = auth.uid()));