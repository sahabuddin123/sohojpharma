
-- S4.10 Data Management

CREATE TABLE IF NOT EXISTS public.data_import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  module text NOT NULL,
  file_name text NOT NULL,
  rows_total integer NOT NULL DEFAULT 0,
  rows_success integer NOT NULL DEFAULT 0,
  rows_failed integer NOT NULL DEFAULT 0,
  rows_duplicate integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed','failed','cancelled')),
  error text,
  duration_ms integer,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_import_jobs TO authenticated;
GRANT ALL ON public.data_import_jobs TO service_role;
ALTER TABLE public.data_import_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read import jobs" ON public.data_import_jobs FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "admins manage import jobs" ON public.data_import_jobs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), tenant_id, 'owner') OR public.has_role(auth.uid(), tenant_id, 'corporate_admin'))
  WITH CHECK (public.has_role(auth.uid(), tenant_id, 'owner') OR public.has_role(auth.uid(), tenant_id, 'corporate_admin'));
CREATE INDEX IF NOT EXISTS idx_data_import_tenant ON public.data_import_jobs(tenant_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.data_export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  module text NOT NULL,
  format text NOT NULL DEFAULT 'xlsx' CHECK (format IN ('xlsx','csv','pdf','json')),
  file_name text,
  row_count integer NOT NULL DEFAULT 0,
  file_size bigint NOT NULL DEFAULT 0,
  storage_path text,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed','failed')),
  error text,
  duration_ms integer,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_export_jobs TO authenticated;
GRANT ALL ON public.data_export_jobs TO service_role;
ALTER TABLE public.data_export_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read export jobs" ON public.data_export_jobs FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "admins manage export jobs" ON public.data_export_jobs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), tenant_id, 'owner') OR public.has_role(auth.uid(), tenant_id, 'corporate_admin'))
  WITH CHECK (public.has_role(auth.uid(), tenant_id, 'owner') OR public.has_role(auth.uid(), tenant_id, 'corporate_admin'));
CREATE INDEX IF NOT EXISTS idx_data_export_tenant ON public.data_export_jobs(tenant_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.data_archives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  module text NOT NULL,
  older_than_days integer NOT NULL DEFAULT 365,
  destination text NOT NULL DEFAULT 'archive_table' CHECK (destination IN ('archive_table','cloud','zip')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
  last_run_at timestamptz,
  last_row_count integer NOT NULL DEFAULT 0,
  storage_path text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_archives TO authenticated;
GRANT ALL ON public.data_archives TO service_role;
ALTER TABLE public.data_archives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read archives" ON public.data_archives FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "admins manage archives" ON public.data_archives FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), tenant_id, 'owner') OR public.has_role(auth.uid(), tenant_id, 'corporate_admin'))
  WITH CHECK (public.has_role(auth.uid(), tenant_id, 'owner') OR public.has_role(auth.uid(), tenant_id, 'corporate_admin'));

DROP TRIGGER IF EXISTS trg_data_archives_updated ON public.data_archives;
CREATE TRIGGER trg_data_archives_updated BEFORE UPDATE ON public.data_archives
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.data_retention_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  entity text NOT NULL,
  retention_days integer NOT NULL DEFAULT 365,
  action text NOT NULL DEFAULT 'archive' CHECK (action IN ('archive','purge','soft_delete')),
  enabled boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, entity)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_retention_policies TO authenticated;
GRANT ALL ON public.data_retention_policies TO service_role;
ALTER TABLE public.data_retention_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read retention" ON public.data_retention_policies FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "admins manage retention" ON public.data_retention_policies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), tenant_id, 'owner') OR public.has_role(auth.uid(), tenant_id, 'corporate_admin'))
  WITH CHECK (public.has_role(auth.uid(), tenant_id, 'owner') OR public.has_role(auth.uid(), tenant_id, 'corporate_admin'));

DROP TRIGGER IF EXISTS trg_data_retention_updated ON public.data_retention_policies;
CREATE TRIGGER trg_data_retention_updated BEFORE UPDATE ON public.data_retention_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.data_cleanup_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  cleanup_type text NOT NULL,
  records_scanned integer NOT NULL DEFAULT 0,
  records_affected integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('in_progress','completed','failed')),
  notes text,
  executed_by uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_cleanup_logs TO authenticated;
GRANT ALL ON public.data_cleanup_logs TO service_role;
ALTER TABLE public.data_cleanup_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read cleanup logs" ON public.data_cleanup_logs FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "admins manage cleanup logs" ON public.data_cleanup_logs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), tenant_id, 'owner') OR public.has_role(auth.uid(), tenant_id, 'corporate_admin'))
  WITH CHECK (public.has_role(auth.uid(), tenant_id, 'owner') OR public.has_role(auth.uid(), tenant_id, 'corporate_admin'));
CREATE INDEX IF NOT EXISTS idx_cleanup_tenant ON public.data_cleanup_logs(tenant_id, started_at DESC);

ALTER TABLE public.tenant_settings ADD COLUMN IF NOT EXISTS data_management jsonb NOT NULL DEFAULT '{}'::jsonb;
