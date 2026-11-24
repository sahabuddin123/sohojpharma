
-- 1. held_sales: restrict SELECT to owner or manager/admin
DROP POLICY IF EXISTS "held_sales_select_member" ON public.held_sales;
CREATE POLICY "held_sales_select_owner_or_manager" ON public.held_sales
  FOR SELECT TO authenticated
  USING (
    is_tenant_member(auth.uid(), tenant_id)
    AND (held_by = auth.uid() OR is_tenant_manager_or_admin(auth.uid(), tenant_id))
  );

-- 2. notification_events: restrict SELECT to tenant owners (hide recipient PII from regular members)
DROP POLICY IF EXISTS "notif_events_owner_select" ON public.notification_events;
CREATE POLICY "notif_events_owner_select" ON public.notification_events
  FOR SELECT TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND has_role(auth.uid(), tenant_id, 'owner'::app_role)
  );

-- 3. tenant_access_violations: remove client-side self insert; writes only via SECURITY DEFINER / service_role
DROP POLICY IF EXISTS "tav_self_insert" ON public.tenant_access_violations;
