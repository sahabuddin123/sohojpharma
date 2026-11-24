
CREATE TABLE IF NOT EXISTS public.printing_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  engine text NOT NULL DEFAULT 'auto' CHECK (engine IN ('chrome','qz','auto')),
  paper_width_mm integer NOT NULL DEFAULT 80 CHECK (paper_width_mm BETWEEN 20 AND 300),
  printer_language text NOT NULL DEFAULT 'ZPL' CHECK (printer_language IN ('ZPL','TSPL','EPL','ESCPOS')),
  auto_connect boolean NOT NULL DEFAULT true,
  copies integer NOT NULL DEFAULT 1 CHECK (copies BETWEEN 1 AND 10),
  auto_print boolean NOT NULL DEFAULT false,
  silent_print boolean NOT NULL DEFAULT true,
  fallback_enabled boolean NOT NULL DEFAULT true,
  printing_v2_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS printing_settings_tenant_branch_uq
  ON public.printing_settings (tenant_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.printing_settings TO authenticated;
GRANT ALL ON public.printing_settings TO service_role;
ALTER TABLE public.printing_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS printing_settings_tenant_all ON public.printing_settings;
CREATE POLICY printing_settings_tenant_all ON public.printing_settings
  FOR ALL USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TABLE IF NOT EXISTS public.printing_printer_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  printer_role text NOT NULL CHECK (printer_role IN ('barcode','receipt','a4','other')),
  name text NOT NULL,
  language text NOT NULL DEFAULT 'ZPL' CHECK (language IN ('ZPL','TSPL','EPL','ESCPOS')),
  paper_width_mm integer NOT NULL DEFAULT 80 CHECK (paper_width_mm BETWEEN 20 AND 300),
  is_default boolean NOT NULL DEFAULT false,
  auto_detected boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS printing_printer_profiles_tenant_branch_idx
  ON public.printing_printer_profiles (tenant_id, branch_id, printer_role);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.printing_printer_profiles TO authenticated;
GRANT ALL ON public.printing_printer_profiles TO service_role;
ALTER TABLE public.printing_printer_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS printing_printer_profiles_tenant_all ON public.printing_printer_profiles;
CREATE POLICY printing_printer_profiles_tenant_all ON public.printing_printer_profiles
  FOR ALL USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TABLE IF NOT EXISTS public.print_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  document_type text NOT NULL,
  document_id text,
  printer_profile_id uuid REFERENCES public.printing_printer_profiles(id) ON DELETE SET NULL,
  printer_name text,
  engine text NOT NULL CHECK (engine IN ('chrome','qz')),
  paper_width_mm integer NOT NULL DEFAULT 80,
  copies integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','printing','completed','failed','cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  failure_reason text,
  dedupe_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms integer
);
CREATE INDEX IF NOT EXISTS print_jobs_tenant_status_idx
  ON public.print_jobs (tenant_id, branch_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS print_jobs_dedupe_idx
  ON public.print_jobs (tenant_id, dedupe_key)
  WHERE status IN ('pending','printing');
GRANT SELECT, INSERT, UPDATE, DELETE ON public.print_jobs TO authenticated;
GRANT ALL ON public.print_jobs TO service_role;
ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS print_jobs_tenant_all ON public.print_jobs;
CREATE POLICY print_jobs_tenant_all ON public.print_jobs
  FOR ALL USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TABLE IF NOT EXISTS public.print_health_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  printer_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('connected','offline','busy','paused','error')),
  latency_ms integer,
  detail text,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS print_health_log_tenant_idx
  ON public.print_health_log (tenant_id, branch_id, printer_name, recorded_at DESC);
GRANT SELECT, INSERT, DELETE ON public.print_health_log TO authenticated;
GRANT ALL ON public.print_health_log TO service_role;
ALTER TABLE public.print_health_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS print_health_log_tenant_all ON public.print_health_log;
CREATE POLICY print_health_log_tenant_all ON public.print_health_log
  FOR ALL USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TABLE IF NOT EXISTS public.printing_label_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('medicine','shelf','price','batch','expiry','qr')),
  language text NOT NULL DEFAULT 'ZPL' CHECK (language IN ('ZPL','TSPL','EPL','ESCPOS')),
  paper_width_mm integer NOT NULL DEFAULT 40,
  paper_height_mm integer NOT NULL DEFAULT 25,
  body text NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS printing_label_templates_tenant_idx
  ON public.printing_label_templates (tenant_id, kind);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.printing_label_templates TO authenticated;
GRANT ALL ON public.printing_label_templates TO service_role;
ALTER TABLE public.printing_label_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS printing_label_templates_read ON public.printing_label_templates;
DROP POLICY IF EXISTS printing_label_templates_write ON public.printing_label_templates;
CREATE POLICY printing_label_templates_read ON public.printing_label_templates
  FOR SELECT USING (is_system = true OR public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY printing_label_templates_write ON public.printing_label_templates
  FOR ALL USING (is_system = false AND tenant_id IS NOT NULL AND public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (is_system = false AND tenant_id IS NOT NULL AND public.is_tenant_member(auth.uid(), tenant_id));

CREATE OR REPLACE FUNCTION public.printing_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_printing_settings_touch2') THEN
    CREATE TRIGGER trg_printing_settings_touch2 BEFORE UPDATE ON public.printing_settings
      FOR EACH ROW EXECUTE FUNCTION public.printing_touch_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_printing_printer_profiles_touch2') THEN
    CREATE TRIGGER trg_printing_printer_profiles_touch2 BEFORE UPDATE ON public.printing_printer_profiles
      FOR EACH ROW EXECUTE FUNCTION public.printing_touch_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_printing_label_templates_touch2') THEN
    CREATE TRIGGER trg_printing_label_templates_touch2 BEFORE UPDATE ON public.printing_label_templates
      FOR EACH ROW EXECUTE FUNCTION public.printing_touch_updated_at();
  END IF;
END $$;

INSERT INTO public.printing_label_templates (tenant_id, branch_id, name, kind, language, paper_width_mm, paper_height_mm, body, is_system)
SELECT NULL, NULL, v.name, v.kind, 'ZPL', v.w, v.h, v.body, true
FROM (VALUES
  ('Default Medicine Label (ZPL)', 'medicine', 40, 25,
   '^XA^CF0,28^FO20,20^FD{{name}}^FS^CF0,20^FO20,55^FD{{strength}}^FS^FO20,80^FDBatch: {{batch}}^FS^FO20,105^FDExp: {{expiry}}^FS^FO20,130^BY2^BCN,60,Y,N,N^FD{{barcode}}^FS^XZ'),
  ('Default Shelf Label (ZPL)', 'shelf', 60, 30,
   '^XA^CF0,30^FO20,20^FD{{name}}^FS^CF0,40^FO20,60^FD{{price}}^FS^FO20,120^BY3^BCN,80,Y,N,N^FD{{barcode}}^FS^XZ'),
  ('Default Price Sticker (ZPL)', 'price', 30, 20,
   '^XA^CF0,40^FO10,10^FD{{price}}^FS^CF0,18^FO10,60^FD{{name}}^FS^XZ')
) AS v(name, kind, w, h, body)
WHERE NOT EXISTS (
  SELECT 1 FROM public.printing_label_templates WHERE is_system = true AND name = v.name
);
