
-- 1) Switch SECURITY DEFINER views to security_invoker
ALTER VIEW public.v_supplier_ledger SET (security_invoker = on);
ALTER VIEW public.v_supplier_ap_recon SET (security_invoker = on);

-- 2) Revoke anon/public EXECUTE on SECURITY DEFINER functions; restrict to authenticated + service_role
DO $$
DECLARE
  r record;
  sig text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'execute')
  LOOP
    sig := format('public.%I(%s)', r.proname, r.args);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', sig);
  END LOOP;
END $$;
