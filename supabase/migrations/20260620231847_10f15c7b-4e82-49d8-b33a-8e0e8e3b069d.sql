
-- S4.9 Backup & Restore
CREATE TABLE IF NOT EXISTS public.backup_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  backup_type text NOT NULL DEFAULT 'database' CHECK (backup_type IN ('database','files','database_files','settings','master_data')),
  frequency text NOT NULL DEFAULT 'manual' CHECK (frequency IN ('manual','daily','weekly','monthly','custom')),
  storage text NOT NULL DEFAULT 'cloud' CHECK (storage IN ('local','cloud','google_drive','s3')),
  format text NOT NULL DEFAULT 'zip' CHECK (format IN ('sql','zip','json')),
  encrypted boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','disabled')),
  cron_expression text,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.backup_jobs TO authenticated;
GRANT ALL ON public.backup_jobs TO service_role;
ALTER TABLE public.backup_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members read backup_jobs" ON public.backup_jobs FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "owners admins manage backup_jobs" ON public.backup_jobs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), tenant_id, 'owner') OR public.has_role(auth.uid(), tenant_id, 'corporate_admin'))
  WITH CHECK (public.has_role(auth.uid(), tenant_id, 'owner') OR public.has_role(auth.uid(), tenant_id, 'corporate_admin'));
CREATE INDEX IF NOT EXISTS idx_backup_jobs_tenant ON public.backup_jobs(tenant_id);

CREATE TABLE IF NOT EXISTS public.backup_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  backup_id uuid REFERENCES public.backup_jobs(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  storage_path text,
  backup_type text NOT NULL DEFAULT 'database',
  trigger text NOT NULL DEFAULT 'manual' CHECK (trigger IN ('manual','scheduled')),
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','success','failed')),
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.backup_history TO authenticated;
GRANT ALL ON public.backup_history TO service_role;
ALTER TABLE public.backup_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members read backup_history" ON public.backup_history FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "owners admins manage backup_history" ON public.backup_history FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), tenant_id, 'owner') OR public.has_role(auth.uid(), tenant_id, 'corporate_admin'))
  WITH CHECK (public.has_role(auth.uid(), tenant_id, 'owner') OR public.has_role(auth.uid(), tenant_id, 'corporate_admin'));
CREATE INDEX IF NOT EXISTS idx_backup_history_tenant ON public.backup_history(tenant_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.restore_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  backup_id uuid REFERENCES public.backup_history(id) ON DELETE SET NULL,
  restore_type text NOT NULL DEFAULT 'full' CHECK (restore_type IN ('full','settings','products','customers','suppliers','inventory','partial')),
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','success','failed','rolled_back')),
  snapshot_id uuid,
  notes text,
  error text,
  restored_by uuid,
  restored_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restore_history TO authenticated;
GRANT ALL ON public.restore_history TO service_role;
ALTER TABLE public.restore_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members read restore_history" ON public.restore_history FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "owners only manage restore_history" ON public.restore_history FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), tenant_id, 'owner'))
  WITH CHECK (public.has_role(auth.uid(), tenant_id, 'owner'));
CREATE INDEX IF NOT EXISTS idx_restore_history_tenant ON public.restore_history(tenant_id, restored_at DESC);

-- Backup settings stored in tenant_settings.backup (jsonb)
ALTER TABLE public.tenant_settings ADD COLUMN IF NOT EXISTS backup jsonb NOT NULL DEFAULT '{}'::jsonb;

-- updated_at trigger for backup_jobs
DROP TRIGGER IF EXISTS trg_backup_jobs_updated ON public.backup_jobs;
CREATE TRIGGER trg_backup_jobs_updated BEFORE UPDATE ON public.backup_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
