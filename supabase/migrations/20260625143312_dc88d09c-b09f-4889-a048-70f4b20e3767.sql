ALTER TABLE public.print_jobs
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payload jsonb;

CREATE INDEX IF NOT EXISTS print_jobs_priority_idx
  ON public.print_jobs (tenant_id, status, priority DESC, created_at ASC);

ALTER TABLE public.printing_label_templates
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE public.printing_printer_profiles
  ADD COLUMN IF NOT EXISTS custom_width_mm integer,
  ADD COLUMN IF NOT EXISTS custom_height_mm integer;