-- B3.1 AUDIT LOG IMMUTABILITY
REVOKE UPDATE, DELETE ON public.audit_log FROM anon, authenticated, service_role, PUBLIC;

CREATE OR REPLACE FUNCTION public.audit_log_block_mutations()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is immutable: % not allowed', TG_OP USING ERRCODE = '42501';
END $$;

DROP TRIGGER IF EXISTS audit_log_no_update ON public.audit_log;
DROP TRIGGER IF EXISTS audit_log_no_delete ON public.audit_log;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_block_mutations();
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_block_mutations();

DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='audit_log' AND cmd IN ('UPDATE','DELETE')
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.audit_log', p.policyname); END LOOP;
END $$;

-- B3.2 SECURITY DEFINER hardening: revoke from API roles
REVOKE EXECUTE ON FUNCTION public.audit_purge(integer)           FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.seed_default_chart(uuid)       FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()              FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bootstrap_trial_subscription() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.audit_row_change()             FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.audit_log_block_mutations()    FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_product_limit()        FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_user_limit()           FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_branch_limit()         FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.test_tenant_isolation()        FROM anon, authenticated, PUBLIC;

-- B3.10 SECURITY EVENTS
CREATE TABLE IF NOT EXISTS public.security_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid,
  tenant_id   uuid,
  event_type  text NOT NULL,
  severity    text NOT NULL DEFAULT 'info',
  detail      text,
  ip_address  inet,
  user_agent  text,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.security_events TO authenticated;
GRANT ALL ON public.security_events TO service_role;
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sec_events_insert_self" ON public.security_events;
CREATE POLICY "sec_events_insert_self" ON public.security_events
  FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS "sec_events_read_admin" ON public.security_events;
CREATE POLICY "sec_events_read_admin" ON public.security_events
  FOR SELECT TO authenticated
  USING (
    tenant_id IS NOT NULL AND (
      public.has_role(auth.uid(), tenant_id, 'owner'::app_role)
      OR public.has_role(auth.uid(), tenant_id, 'manager'::app_role)
    )
  );

REVOKE UPDATE, DELETE ON public.security_events FROM anon, authenticated, service_role, PUBLIC;
CREATE INDEX IF NOT EXISTS idx_sec_events_tenant_time ON public.security_events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sec_events_type_time   ON public.security_events(event_type, created_at DESC);