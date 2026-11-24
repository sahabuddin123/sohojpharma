
-- B11 Clinical Safety

-- 1. Enums
DO $$ BEGIN
  CREATE TYPE public.interaction_severity AS ENUM ('minor','moderate','major','contraindicated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.pregnancy_category AS ENUM ('safe','caution','avoid','contraindicated','unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.rx_review_status AS ENUM ('pending','approved','overridden','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Drug interactions (global reference data)
CREATE TABLE IF NOT EXISTS public.drug_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generic_a text NOT NULL,
  generic_b text NOT NULL,
  severity public.interaction_severity NOT NULL,
  effect text,
  management text,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (lower(generic_a) < lower(generic_b)),
  UNIQUE (generic_a, generic_b)
);
GRANT SELECT ON public.drug_interactions TO authenticated, anon;
GRANT ALL ON public.drug_interactions TO service_role;
ALTER TABLE public.drug_interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY di_read_all ON public.drug_interactions FOR SELECT TO authenticated, anon USING (true);
CREATE INDEX IF NOT EXISTS idx_di_a ON public.drug_interactions(lower(generic_a));
CREATE INDEX IF NOT EXISTS idx_di_b ON public.drug_interactions(lower(generic_b));

-- 3. Therapeutic class on generics (for duplicate-therapy detection)
ALTER TABLE public.generics
  ADD COLUMN IF NOT EXISTS therapeutic_class text,
  ADD COLUMN IF NOT EXISTS atc_code text;
CREATE INDEX IF NOT EXISTS idx_generics_class ON public.generics(lower(therapeutic_class));

-- 4. Pregnancy / pediatric / elderly metadata on medicine_master
ALTER TABLE public.medicine_master
  ADD COLUMN IF NOT EXISTS pregnancy_category public.pregnancy_category NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS pediatric_min_age_months int,
  ADD COLUMN IF NOT EXISTS pediatric_max_age_months int,
  ADD COLUMN IF NOT EXISTS elderly_high_risk boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notes_clinical text;

-- 5. Patient profile (extend existing patients)
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS weight_kg numeric,
  ADD COLUMN IF NOT EXISTS blood_group text,
  ADD COLUMN IF NOT EXISTS allergies jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS chronic_conditions jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS is_pregnant boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pregnancy_weeks int;

-- 6. Prescription review workflow
ALTER TABLE public.prescriptions
  ADD COLUMN IF NOT EXISTS review_status public.rx_review_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS override_reason text,
  ADD COLUMN IF NOT EXISTS ai_summary text;

-- 7. Doctor metadata (additive)
ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS registration_number text,
  ADD COLUMN IF NOT EXISTS speciality text;

-- 8. Clinical audit log
CREATE TABLE IF NOT EXISTS public.clinical_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  prescription_id uuid REFERENCES public.prescriptions(id) ON DELETE SET NULL,
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  warning_type text NOT NULL,
  severity text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}',
  action_taken text,
  pharmacist_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.clinical_audit TO authenticated;
GRANT ALL ON public.clinical_audit TO service_role;
ALTER TABLE public.clinical_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY ca_member_read ON public.clinical_audit FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY ca_member_insert ON public.clinical_audit FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE INDEX IF NOT EXISTS idx_ca_tenant_patient ON public.clinical_audit(tenant_id, patient_id);

-- 9. Safety check RPC (used by POS/prescription review)
CREATE OR REPLACE FUNCTION public.clinical_safety_check(
  _tenant_id uuid,
  _patient_id uuid,
  _product_ids uuid[]
) RETURNS TABLE (
  warning_type text,
  severity text,
  product_id uuid,
  product_id_b uuid,
  message text
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pat public.patients;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  IF _patient_id IS NOT NULL THEN
    SELECT * INTO v_pat FROM public.patients WHERE id = _patient_id AND tenant_id = _tenant_id;
  END IF;

  -- Allergy: any product whose generic name overlaps patient allergy list
  IF v_pat.id IS NOT NULL AND jsonb_array_length(COALESCE(v_pat.allergies,'[]')) > 0 THEN
    RETURN QUERY
    SELECT 'allergy'::text, 'major'::text, p.id, NULL::uuid,
           'Patient is allergic to ' || g.name
    FROM unnest(_product_ids) WITH ORDINALITY pid(id,ord)
    JOIN public.products p ON p.id = pid.id AND p.tenant_id = _tenant_id
    JOIN public.generics g ON g.id = p.generic_id
    WHERE EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(v_pat.allergies) a(val)
      WHERE lower(a.val) = lower(g.name)
         OR lower(g.name) LIKE '%'||lower(a.val)||'%'
    );
  END IF;

  -- Therapeutic duplication: two products sharing generic or therapeutic_class
  RETURN QUERY
  SELECT 'duplicate_therapy'::text,'moderate'::text, p1.id, p2.id,
         'Duplicate therapy: ' || COALESCE(g1.therapeutic_class, g1.name)
  FROM unnest(_product_ids) a(id)
  JOIN unnest(_product_ids) b(id) ON a.id < b.id
  JOIN public.products p1 ON p1.id = a.id AND p1.tenant_id = _tenant_id
  JOIN public.products p2 ON p2.id = b.id AND p2.tenant_id = _tenant_id
  JOIN public.generics g1 ON g1.id = p1.generic_id
  JOIN public.generics g2 ON g2.id = p2.generic_id
  WHERE g1.id = g2.id
     OR (g1.therapeutic_class IS NOT NULL AND lower(g1.therapeutic_class) = lower(g2.therapeutic_class));

  -- Drug-drug interactions
  RETURN QUERY
  SELECT 'interaction'::text, di.severity::text, p1.id, p2.id,
         COALESCE(di.effect,'Interaction between ' || g1.name || ' and ' || g2.name)
  FROM unnest(_product_ids) a(id)
  JOIN unnest(_product_ids) b(id) ON a.id < b.id
  JOIN public.products p1 ON p1.id = a.id AND p1.tenant_id = _tenant_id
  JOIN public.products p2 ON p2.id = b.id AND p2.tenant_id = _tenant_id
  JOIN public.generics g1 ON g1.id = p1.generic_id
  JOIN public.generics g2 ON g2.id = p2.generic_id
  JOIN public.drug_interactions di
    ON (lower(di.generic_a) = lower(LEAST(g1.name, g2.name))
    AND lower(di.generic_b) = lower(GREATEST(g1.name, g2.name)));

  -- Pregnancy
  IF v_pat.id IS NOT NULL AND v_pat.is_pregnant THEN
    RETURN QUERY
    SELECT 'pregnancy'::text,
           CASE m.pregnancy_category
             WHEN 'contraindicated' THEN 'major'
             WHEN 'avoid' THEN 'major'
             WHEN 'caution' THEN 'moderate'
             ELSE 'minor' END,
           p.id, NULL::uuid,
           'Pregnancy risk: ' || m.pregnancy_category::text
    FROM unnest(_product_ids) pid(id)
    JOIN public.products p ON p.id = pid.id AND p.tenant_id = _tenant_id
    JOIN public.medicine_master m ON lower(m.brand_name) = lower(p.name)
    WHERE m.pregnancy_category IN ('caution','avoid','contraindicated');
  END IF;

  -- Pediatric (age in months)
  IF v_pat.id IS NOT NULL AND v_pat.date_of_birth IS NOT NULL THEN
    RETURN QUERY
    WITH age_m AS (
      SELECT EXTRACT(YEAR FROM age(v_pat.date_of_birth))*12
           + EXTRACT(MONTH FROM age(v_pat.date_of_birth)) AS months
    )
    SELECT 'pediatric'::text,'moderate'::text, p.id, NULL::uuid,
           'Outside pediatric age range for ' || p.name
    FROM unnest(_product_ids) pid(id)
    JOIN public.products p ON p.id = pid.id AND p.tenant_id = _tenant_id
    JOIN public.medicine_master m ON lower(m.brand_name) = lower(p.name)
    CROSS JOIN age_m
    WHERE (m.pediatric_min_age_months IS NOT NULL AND age_m.months < m.pediatric_min_age_months)
       OR (m.pediatric_max_age_months IS NOT NULL AND age_m.months > m.pediatric_max_age_months);

    -- Elderly (>=65y)
    RETURN QUERY
    SELECT 'elderly'::text,'moderate'::text, p.id, NULL::uuid,
           'Potentially inappropriate for elderly: ' || p.name
    FROM unnest(_product_ids) pid(id)
    JOIN public.products p ON p.id = pid.id AND p.tenant_id = _tenant_id
    JOIN public.medicine_master m ON lower(m.brand_name) = lower(p.name)
    WHERE m.elderly_high_risk = true
      AND EXTRACT(YEAR FROM age(v_pat.date_of_birth)) >= 65;
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.clinical_safety_check(uuid,uuid,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clinical_safety_check(uuid,uuid,uuid[]) TO authenticated;

-- 10. Substitute engine: find alternatives by same generic + strength + dosage form
CREATE OR REPLACE FUNCTION public.find_substitutes(_tenant_id uuid, _product_id uuid)
RETURNS TABLE(id uuid, name text, sku text, retail_price numeric, qty_on_hand numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p2.id, p2.name, p2.sku, p2.retail_price,
         COALESCE((SELECT SUM(qty_on_hand) FROM public.batches b
                   WHERE b.product_id = p2.id AND b.tenant_id = _tenant_id),0)
  FROM public.products p1
  JOIN public.products p2
    ON p2.tenant_id = p1.tenant_id
   AND p2.generic_id = p1.generic_id
   AND p2.id <> p1.id
  WHERE p1.id = _product_id
    AND p1.tenant_id = _tenant_id
    AND public.is_tenant_member(auth.uid(), _tenant_id)
  ORDER BY p2.retail_price ASC
  LIMIT 20
$$;
REVOKE EXECUTE ON FUNCTION public.find_substitutes(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_substitutes(uuid,uuid) TO authenticated;
