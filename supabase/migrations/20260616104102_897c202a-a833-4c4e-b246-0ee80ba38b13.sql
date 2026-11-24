-- B4.6  ERROR LOGS
CREATE TABLE IF NOT EXISTS public.error_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid,
  user_id     uuid,
  level       text NOT NULL DEFAULT 'error',   -- 'error' | 'warning' | 'info'
  source      text NOT NULL,                   -- 'frontend' | 'server_fn' | 'edge' | 'db'
  message     text NOT NULL,
  stack       text,
  route       text,
  release     text,
  context     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.error_logs TO authenticated;
GRANT ALL ON public.error_logs TO service_role;
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "error_logs_insert_self" ON public.error_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "error_logs_read_admin" ON public.error_logs
  FOR SELECT TO authenticated
  USING (
    tenant_id IS NOT NULL AND (
      public.has_role(auth.uid(), tenant_id, 'owner'::app_role)
      OR public.has_role(auth.uid(), tenant_id, 'manager'::app_role)
    )
  );

REVOKE UPDATE, DELETE ON public.error_logs FROM anon, authenticated, service_role, PUBLIC;
CREATE INDEX IF NOT EXISTS idx_error_logs_tenant_time ON public.error_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_level_time  ON public.error_logs(level, created_at DESC);

-- B4.7  JOB FAILURES
CREATE TABLE IF NOT EXISTS public.job_failures (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid,
  job_type    text NOT NULL,                   -- 'notification'|'sync'|'webhook'|'billing'|'email'
  job_ref     text,
  error       text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  retry_count int NOT NULL DEFAULT 0,
  resolved_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.job_failures TO authenticated;
GRANT ALL ON public.job_failures TO service_role;
ALTER TABLE public.job_failures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_failures_read_admin" ON public.job_failures
  FOR SELECT TO authenticated
  USING (
    tenant_id IS NOT NULL AND (
      public.has_role(auth.uid(), tenant_id, 'owner'::app_role)
      OR public.has_role(auth.uid(), tenant_id, 'manager'::app_role)
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.job_failures FROM anon, authenticated, PUBLIC;
CREATE INDEX IF NOT EXISTS idx_job_failures_tenant_time ON public.job_failures(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_failures_type_time   ON public.job_failures(job_type, created_at DESC);