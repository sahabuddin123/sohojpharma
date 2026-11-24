
-- B12: AI Prescription Intelligence
CREATE TABLE public.prescription_ocr_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  prescription_id uuid REFERENCES public.prescriptions(id) ON DELETE CASCADE,
  image_url text,
  source text NOT NULL DEFAULT 'upload' CHECK (source IN ('camera','upload','pdf','mobile')),
  provider text NOT NULL DEFAULT 'gemini' CHECK (provider IN ('gemini','google_vision','azure','manual')),
  provider_fallback_chain text[] DEFAULT ARRAY['gemini','google_vision','azure']::text[],
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','completed','failed','review_required')),
  raw_text text,
  parsed_json jsonb DEFAULT '{}'::jsonb,
  detected_medicines jsonb DEFAULT '[]'::jsonb,
  matched_medicines jsonb DEFAULT '[]'::jsonb,
  warnings jsonb DEFAULT '[]'::jsonb,
  confidence numeric(5,2),
  language text DEFAULT 'en',
  doctor_id uuid REFERENCES public.doctors(id) ON DELETE SET NULL,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  pharmacist_review_status text DEFAULT 'pending' CHECK (pharmacist_review_status IN ('pending','approved','rejected','modified')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  error_message text,
  processing_ms integer,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prescription_ocr_jobs TO authenticated;
GRANT ALL ON public.prescription_ocr_jobs TO service_role;
ALTER TABLE public.prescription_ocr_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ocr_jobs_tenant" ON public.prescription_ocr_jobs FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE INDEX idx_ocr_jobs_tenant_created ON public.prescription_ocr_jobs(tenant_id, created_at DESC);
CREATE INDEX idx_ocr_jobs_prescription ON public.prescription_ocr_jobs(prescription_id);
CREATE TRIGGER trg_ocr_jobs_updated BEFORE UPDATE ON public.prescription_ocr_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.doctor_writing_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  signature_samples jsonb DEFAULT '[]'::jsonb,
  common_medicines jsonb DEFAULT '[]'::jsonb,
  style_hints jsonb DEFAULT '{}'::jsonb,
  ocr_samples integer NOT NULL DEFAULT 0,
  avg_confidence numeric(5,2),
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, doctor_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.doctor_writing_profiles TO authenticated;
GRANT ALL ON public.doctor_writing_profiles TO service_role;
ALTER TABLE public.doctor_writing_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "doctor_profiles_tenant" ON public.doctor_writing_profiles FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE TRIGGER trg_doctor_profiles_updated BEFORE UPDATE ON public.doctor_writing_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.ai_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  metric_type text NOT NULL,
  doctor_id uuid REFERENCES public.doctors(id) ON DELETE SET NULL,
  ocr_job_id uuid REFERENCES public.prescription_ocr_jobs(id) ON DELETE CASCADE,
  value numeric,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ai_metrics TO authenticated;
GRANT ALL ON public.ai_metrics TO service_role;
ALTER TABLE public.ai_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_metrics_tenant_read" ON public.ai_metrics FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "ai_metrics_tenant_insert" ON public.ai_metrics FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE INDEX idx_ai_metrics_tenant_type ON public.ai_metrics(tenant_id, metric_type, created_at DESC);

-- Quantity dose interpreter (BD/TDS/QID/SOS/etc.)
CREATE OR REPLACE FUNCTION public.calc_dose_qty(_dose text, _days integer)
RETURNS integer LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE v_per_day numeric := 0; v_norm text; v_parts text[]; v_p text;
BEGIN
  IF _dose IS NULL OR _days IS NULL OR _days <= 0 THEN RETURN 0; END IF;
  v_norm := lower(regexp_replace(_dose, '\s+', '', 'g'));
  v_per_day := CASE
    WHEN v_norm IN ('od','daily','hs','qd') THEN 1
    WHEN v_norm IN ('bd','bid','bid.') THEN 2
    WHEN v_norm IN ('tds','tid') THEN 3
    WHEN v_norm IN ('qid','qds') THEN 4
    WHEN v_norm IN ('sos','prn') THEN 1
    ELSE 0 END;
  IF v_per_day = 0 AND v_norm ~ '^[0-9]+(\+[0-9]+)+$' THEN
    v_parts := string_to_array(v_norm, '+');
    FOREACH v_p IN ARRAY v_parts LOOP v_per_day := v_per_day + v_p::numeric; END LOOP;
  END IF;
  IF v_per_day = 0 THEN v_per_day := 1; END IF;
  RETURN CEIL(v_per_day * _days)::int;
END $$;

-- AI accuracy rollup
CREATE OR REPLACE VIEW public.v_ai_accuracy AS
SELECT tenant_id,
       count(*) FILTER (WHERE status='completed') AS completed,
       count(*) FILTER (WHERE status='failed')    AS failed,
       count(*) FILTER (WHERE pharmacist_review_status='approved')  AS approved,
       count(*) FILTER (WHERE pharmacist_review_status='modified')  AS modified,
       count(*) FILTER (WHERE pharmacist_review_status='rejected')  AS rejected,
       round(avg(confidence) FILTER (WHERE confidence IS NOT NULL), 2) AS avg_confidence,
       round(avg(processing_ms) FILTER (WHERE processing_ms IS NOT NULL))::int AS avg_ms
  FROM public.prescription_ocr_jobs
 GROUP BY tenant_id;
ALTER VIEW public.v_ai_accuracy SET (security_invoker = on);
GRANT SELECT ON public.v_ai_accuracy TO authenticated;
