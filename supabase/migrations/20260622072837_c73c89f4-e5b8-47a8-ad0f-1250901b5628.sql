
-- ============= Phase 3.4 — Clinical Intelligence Layer =============

-- 1. Therapeutic classes
CREATE TABLE public.global_therapeutic_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  code text UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.global_therapeutic_classes TO authenticated;
GRANT ALL ON public.global_therapeutic_classes TO service_role;
ALTER TABLE public.global_therapeutic_classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "therapeutic_classes_read" ON public.global_therapeutic_classes FOR SELECT TO authenticated USING (true);
CREATE POLICY "therapeutic_classes_admin_write" ON public.global_therapeutic_classes FOR ALL TO authenticated
  USING (public.is_app_admin(auth.uid())) WITH CHECK (public.is_app_admin(auth.uid()));

-- 2. Medicine ↔ therapeutic class
CREATE TABLE public.global_medicine_therapeutic_classes (
  medicine_id uuid NOT NULL REFERENCES public.global_medicines(id) ON DELETE CASCADE,
  therapeutic_class_id uuid NOT NULL REFERENCES public.global_therapeutic_classes(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (medicine_id, therapeutic_class_id)
);
GRANT SELECT ON public.global_medicine_therapeutic_classes TO authenticated;
GRANT ALL ON public.global_medicine_therapeutic_classes TO service_role;
ALTER TABLE public.global_medicine_therapeutic_classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gmtc_read" ON public.global_medicine_therapeutic_classes FOR SELECT TO authenticated USING (true);
CREATE POLICY "gmtc_admin_write" ON public.global_medicine_therapeutic_classes FOR ALL TO authenticated
  USING (public.is_app_admin(auth.uid())) WITH CHECK (public.is_app_admin(auth.uid()));
CREATE INDEX idx_gmtc_class ON public.global_medicine_therapeutic_classes(therapeutic_class_id);

-- 3. Medicine alternatives
CREATE TABLE public.global_medicine_alternatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_medicine_id uuid NOT NULL REFERENCES public.global_medicines(id) ON DELETE CASCADE,
  alternative_medicine_id uuid NOT NULL REFERENCES public.global_medicines(id) ON DELETE CASCADE,
  strength_match boolean NOT NULL DEFAULT false,
  generic_match boolean NOT NULL DEFAULT false,
  therapeutic_match boolean NOT NULL DEFAULT false,
  notes text,
  approved boolean NOT NULL DEFAULT false,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gma_not_self CHECK (source_medicine_id <> alternative_medicine_id),
  UNIQUE (source_medicine_id, alternative_medicine_id)
);
GRANT SELECT ON public.global_medicine_alternatives TO authenticated;
GRANT ALL ON public.global_medicine_alternatives TO service_role;
ALTER TABLE public.global_medicine_alternatives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gma_read" ON public.global_medicine_alternatives FOR SELECT TO authenticated USING (approved = true OR public.is_app_admin(auth.uid()));
CREATE POLICY "gma_admin_write" ON public.global_medicine_alternatives FOR ALL TO authenticated
  USING (public.is_app_admin(auth.uid())) WITH CHECK (public.is_app_admin(auth.uid()));
CREATE INDEX idx_gma_source ON public.global_medicine_alternatives(source_medicine_id);
CREATE INDEX idx_gma_alt ON public.global_medicine_alternatives(alternative_medicine_id);

-- 4. Drug interactions (ordered pair: medicine_a < medicine_b for uniqueness)
CREATE TYPE public.drug_interaction_severity AS ENUM ('minor', 'moderate', 'major');
CREATE TABLE public.global_drug_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medicine_a uuid NOT NULL REFERENCES public.global_medicines(id) ON DELETE CASCADE,
  medicine_b uuid NOT NULL REFERENCES public.global_medicines(id) ON DELETE CASCADE,
  severity public.drug_interaction_severity NOT NULL,
  description text,
  clinical_effect text,
  recommendation text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gdi_ordered CHECK (medicine_a < medicine_b),
  UNIQUE (medicine_a, medicine_b)
);
GRANT SELECT ON public.global_drug_interactions TO authenticated;
GRANT ALL ON public.global_drug_interactions TO service_role;
ALTER TABLE public.global_drug_interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gdi_read" ON public.global_drug_interactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "gdi_admin_write" ON public.global_drug_interactions FOR ALL TO authenticated
  USING (public.is_app_admin(auth.uid())) WITH CHECK (public.is_app_admin(auth.uid()));
CREATE INDEX idx_gdi_a ON public.global_drug_interactions(medicine_a);
CREATE INDEX idx_gdi_b ON public.global_drug_interactions(medicine_b);

-- 5. Prescription / safety flags on global_medicines (prescription_required already exists)
ALTER TABLE public.global_medicines
  ADD COLUMN IF NOT EXISTS otc_allowed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pregnancy_category text,
  ADD COLUMN IF NOT EXISTS lactation_warning text,
  ADD COLUMN IF NOT EXISTS pediatric_warning text,
  ADD COLUMN IF NOT EXISTS geriatric_warning text;

-- 6. Dosage guides
CREATE TABLE public.global_dosage_guides (
  medicine_id uuid PRIMARY KEY REFERENCES public.global_medicines(id) ON DELETE CASCADE,
  adult_dose text,
  child_dose text,
  max_daily_dose text,
  renal_adjustment text,
  hepatic_adjustment text,
  administration_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.global_dosage_guides TO authenticated;
GRANT ALL ON public.global_dosage_guides TO service_role;
ALTER TABLE public.global_dosage_guides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gdg_read" ON public.global_dosage_guides FOR SELECT TO authenticated USING (true);
CREATE POLICY "gdg_admin_write" ON public.global_dosage_guides FOR ALL TO authenticated
  USING (public.is_app_admin(auth.uid())) WITH CHECK (public.is_app_admin(auth.uid()));

-- 7. Contraindications
CREATE TABLE public.global_contraindications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medicine_id uuid NOT NULL REFERENCES public.global_medicines(id) ON DELETE CASCADE,
  condition text NOT NULL,
  severity public.drug_interaction_severity NOT NULL DEFAULT 'moderate',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (medicine_id, condition)
);
GRANT SELECT ON public.global_contraindications TO authenticated;
GRANT ALL ON public.global_contraindications TO service_role;
ALTER TABLE public.global_contraindications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gci_read" ON public.global_contraindications FOR SELECT TO authenticated USING (true);
CREATE POLICY "gci_admin_write" ON public.global_contraindications FOR ALL TO authenticated
  USING (public.is_app_admin(auth.uid())) WITH CHECK (public.is_app_admin(auth.uid()));
CREATE INDEX idx_gci_medicine ON public.global_contraindications(medicine_id);

-- 8. updated_at trigger reuse
CREATE OR REPLACE FUNCTION public.tg_clinical_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE TRIGGER trg_gtc_updated BEFORE UPDATE ON public.global_therapeutic_classes
  FOR EACH ROW EXECUTE FUNCTION public.tg_clinical_touch_updated_at();
CREATE TRIGGER trg_gdi_updated BEFORE UPDATE ON public.global_drug_interactions
  FOR EACH ROW EXECUTE FUNCTION public.tg_clinical_touch_updated_at();
CREATE TRIGGER trg_gdg_updated BEFORE UPDATE ON public.global_dosage_guides
  FOR EACH ROW EXECUTE FUNCTION public.tg_clinical_touch_updated_at();

-- 9. Seed starter therapeutic classes
INSERT INTO public.global_therapeutic_classes (name, code, description) VALUES
  ('Analgesic', 'ANALG', 'Pain relief medications'),
  ('NSAID', 'NSAID', 'Non-steroidal anti-inflammatory drugs'),
  ('Antibiotic', 'ANTIB', 'Antibacterial agents'),
  ('Antihistamine', 'AHIST', 'Allergy/histamine blockers'),
  ('PPI', 'PPI', 'Proton pump inhibitors'),
  ('Antidiabetic', 'ADIAB', 'Blood sugar lowering agents'),
  ('Antihypertensive', 'AHTN', 'Blood pressure lowering agents'),
  ('Antifungal', 'AFUNG', 'Antifungal agents'),
  ('Antiviral', 'AVIRL', 'Antiviral agents'),
  ('Bronchodilator', 'BRONCH', 'Airway relaxants'),
  ('Corticosteroid', 'STERO', 'Steroid anti-inflammatories'),
  ('Vitamin/Supplement', 'VITSUP', 'Vitamins and supplements')
ON CONFLICT (name) DO NOTHING;

-- 10. RPC: pairwise drug interactions for a basket of medicine IDs (POS warnings)
CREATE OR REPLACE FUNCTION public.get_basket_interactions(_medicine_ids uuid[])
RETURNS TABLE (
  medicine_a uuid, medicine_b uuid,
  severity public.drug_interaction_severity,
  description text, clinical_effect text, recommendation text,
  a_name text, b_name text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT di.medicine_a, di.medicine_b, di.severity, di.description, di.clinical_effect, di.recommendation,
         ma.brand_name AS a_name, mb.brand_name AS b_name
  FROM public.global_drug_interactions di
  JOIN public.global_medicines ma ON ma.id = di.medicine_a
  JOIN public.global_medicines mb ON mb.id = di.medicine_b
  WHERE di.medicine_a = ANY(_medicine_ids) AND di.medicine_b = ANY(_medicine_ids);
$$;
GRANT EXECUTE ON FUNCTION public.get_basket_interactions(uuid[]) TO authenticated;
