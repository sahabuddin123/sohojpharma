
CREATE POLICY "plans_admin_insert" ON public.plans
  FOR INSERT TO authenticated
  WITH CHECK (is_app_admin(auth.uid()));
CREATE POLICY "plans_admin_update" ON public.plans
  FOR UPDATE TO authenticated
  USING (is_app_admin(auth.uid()))
  WITH CHECK (is_app_admin(auth.uid()));
CREATE POLICY "plans_admin_delete" ON public.plans
  FOR DELETE TO authenticated
  USING (is_app_admin(auth.uid()));
