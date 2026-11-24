
-- E17.2.2: Clinical Safety Engine

-- 1. Extend drug_interactions with optional FK columns (existing rows keep generic_a/b text)
ALTER TABLE public.drug_interactions
  ADD COLUMN IF NOT EXISTS generic_a_id uuid REFERENCES public.generics(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS generic_b_id uuid REFERENCES public.generics(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS clinical_note text;

CREATE INDEX IF NOT EXISTS idx_drug_interactions_generic_a_id ON public.drug_interactions(generic_a_id);
CREATE INDEX IF NOT EXISTS idx_drug_interactions_generic_b_id ON public.drug_interactions(generic_b_id);
CREATE INDEX IF NOT EXISTS idx_drug_interactions_generic_a_lower ON public.drug_interactions(lower(generic_a));
CREATE INDEX IF NOT EXISTS idx_drug_interactions_generic_b_lower ON public.drug_interactions(lower(generic_b));

-- 2. Dosage rules table
CREATE TABLE IF NOT EXISTS public.dosage_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  generic_id uuid REFERENCES public.generics(id) ON DELETE CASCADE,
  generic_name text,
  min_daily_dose numeric,
  max_daily_dose numeric,
  dose_unit text,
  max_duration_days integer,
  child_weight_required boolean NOT NULL DEFAULT false,
  pregnancy_warning boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dosage_rules TO authenticated;
GRANT ALL ON public.dosage_rules TO service_role;

ALTER TABLE public.dosage_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dosage_rules read" ON public.dosage_rules
  FOR SELECT TO authenticated
  USING (tenant_id IS NULL OR tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));

CREATE POLICY "dosage_rules write" ON public.dosage_rules
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_dosage_rules_generic_id ON public.dosage_rules(generic_id);
CREATE INDEX IF NOT EXISTS idx_dosage_rules_generic_name_lower ON public.dosage_rules(lower(generic_name));

-- 3. Prescription safety ack columns (reviewed_by/at/override_reason already exist; add ack severity tag)
ALTER TABLE public.prescriptions
  ADD COLUMN IF NOT EXISTS safety_ack_severity text,
  ADD COLUMN IF NOT EXISTS safety_ack_at timestamptz;
