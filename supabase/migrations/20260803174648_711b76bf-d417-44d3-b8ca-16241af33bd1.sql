DROP POLICY IF EXISTS "tenant owners read backups" ON public.backup_runs;
CREATE POLICY "tenant owners read backups" ON public.backup_runs
FOR SELECT TO authenticated
USING (
  (tenant_id IS NULL AND public.is_app_admin(auth.uid()))
  OR (tenant_id IS NOT NULL AND public.has_role(auth.uid(), tenant_id, 'owner'::app_role))
);