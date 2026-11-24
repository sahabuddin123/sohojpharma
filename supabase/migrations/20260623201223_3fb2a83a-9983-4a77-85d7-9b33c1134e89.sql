-- 1. Fix mutable search_path on 5 remaining functions
ALTER FUNCTION public.enforce_plan_limit_branch() SET search_path = public;
ALTER FUNCTION public.enforce_plan_limit_user() SET search_path = public;
ALTER FUNCTION public.enforce_plan_limit_warehouse() SET search_path = public;
ALTER FUNCTION public._cycle_months(text) SET search_path = public;
ALTER FUNCTION public.precision_test_due(numeric, numeric, integer) SET search_path = public;

-- 2. Revoke EXECUTE from anon & PUBLIC on every SECURITY DEFINER function in public schema.
--    Authenticated users retain access; anon (unauthenticated) callers are blocked.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon;',
                   r.nspname, r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated, service_role;',
                   r.nspname, r.proname, r.args);
  END LOOP;
END $$;

-- 3. Re-scope customer policies from public role to authenticated.
DROP POLICY IF EXISTS cr_tenant_all ON public.customer_reminders;
CREATE POLICY cr_tenant_all ON public.customer_reminders
  FOR ALL TO authenticated
  USING (is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (is_tenant_member(auth.uid(), tenant_id));

DROP POLICY IF EXISTS campaigns_tenant_all ON public.customer_campaigns;
CREATE POLICY campaigns_tenant_all ON public.customer_campaigns
  FOR ALL TO authenticated
  USING (is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (is_tenant_member(auth.uid(), tenant_id));

DROP POLICY IF EXISTS cp_tenant_all ON public.customer_points;
CREATE POLICY cp_tenant_all ON public.customer_points
  FOR ALL TO authenticated
  USING (is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (is_tenant_member(auth.uid(), tenant_id));