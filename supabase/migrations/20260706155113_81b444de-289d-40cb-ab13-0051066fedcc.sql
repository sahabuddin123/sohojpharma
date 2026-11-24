
-- Restrict role_permissions writes to owners only
DROP POLICY IF EXISTS "role_permissions write" ON public.role_permissions;
CREATE POLICY "role_permissions write" ON public.role_permissions
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.roles r
      WHERE r.id = role_permissions.role_id
        AND r.tenant_id IS NOT NULL
        AND has_role(auth.uid(), r.tenant_id, 'owner'::app_role)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.roles r
      WHERE r.id = role_permissions.role_id
        AND r.tenant_id IS NOT NULL
        AND has_role(auth.uid(), r.tenant_id, 'owner'::app_role)
    )
  );

-- Restrict user_role_assignments writes to owners only
DROP POLICY IF EXISTS "ura write" ON public.user_role_assignments;
CREATE POLICY "ura write" ON public.user_role_assignments
  TO authenticated
  USING (has_role(auth.uid(), tenant_id, 'owner'::app_role))
  WITH CHECK (has_role(auth.uid(), tenant_id, 'owner'::app_role));
