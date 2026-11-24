
-- 1. api_keys: restrict to tenant owners only
DROP POLICY IF EXISTS "tenant members manage api_keys" ON public.api_keys;
CREATE POLICY "tenant owners manage api_keys" ON public.api_keys
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), tenant_id, 'owner'::app_role))
  WITH CHECK (has_role(auth.uid(), tenant_id, 'owner'::app_role));

-- 2. webhooks: restrict to tenant owners only
DROP POLICY IF EXISTS "tenant members manage webhooks" ON public.webhooks;
CREATE POLICY "tenant owners manage webhooks" ON public.webhooks
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), tenant_id, 'owner'::app_role))
  WITH CHECK (has_role(auth.uid(), tenant_id, 'owner'::app_role));

-- 3. tenant_domains: restrict to tenant owners only (verification_token exposure)
DROP POLICY IF EXISTS "td_member_all" ON public.tenant_domains;
CREATE POLICY "td_owner_all" ON public.tenant_domains
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), tenant_id, 'owner'::app_role))
  WITH CHECK (has_role(auth.uid(), tenant_id, 'owner'::app_role));

-- 4. user_roles: add INSERT/UPDATE/DELETE policies (owner only)
CREATE POLICY "roles_owner_insert" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), tenant_id, 'owner'::app_role));
CREATE POLICY "roles_owner_update" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), tenant_id, 'owner'::app_role))
  WITH CHECK (has_role(auth.uid(), tenant_id, 'owner'::app_role));
CREATE POLICY "roles_owner_delete" ON public.user_roles
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), tenant_id, 'owner'::app_role));

-- 5. error_logs: require tenant membership on insert
DROP POLICY IF EXISTS "error_logs_insert_self" ON public.error_logs;
CREATE POLICY "error_logs_insert_self" ON public.error_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    (user_id IS NULL OR user_id = auth.uid())
    AND (tenant_id IS NULL OR is_tenant_member(auth.uid(), tenant_id))
  );

-- 6. security_events: require tenant membership on insert
DROP POLICY IF EXISTS "sec_events_insert_self" ON public.security_events;
CREATE POLICY "sec_events_insert_self" ON public.security_events
  FOR INSERT TO authenticated
  WITH CHECK (
    (user_id IS NULL OR user_id = auth.uid())
    AND (tenant_id IS NULL OR is_tenant_member(auth.uid(), tenant_id))
  );
