
CREATE OR REPLACE FUNCTION public.smart_medicine_search(_q text, _limit int DEFAULT 25)
RETURNS TABLE(
  id uuid, brand_name text, generic_name text, manufacturer_name text,
  strength text, dosage_form text, prescription_required boolean, otc_allowed boolean,
  pregnancy_category text, pediatric_warning text, geriatric_warning text,
  match_type text, score real
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, extensions AS $$
  WITH q AS (SELECT COALESCE(NULLIF(trim(_q), ''), '') AS s),
  base AS (
    SELECT m.id, m.brand_name, gg.name AS generic_name, gmf.name AS manufacturer_name,
      m.strength, m.dosage_form, m.prescription_required, m.otc_allowed,
      m.pregnancy_category, m.pediatric_warning, m.geriatric_warning, m.search_tsv
    FROM public.global_medicines m
    LEFT JOIN public.global_generics gg ON gg.id = m.generic_id
    LEFT JOIN public.global_manufacturers gmf ON gmf.id = m.manufacturer_id
  )
  SELECT DISTINCT ON (id) * FROM (
    SELECT b.id, b.brand_name, b.generic_name, b.manufacturer_name, b.strength, b.dosage_form,
           b.prescription_required, b.otc_allowed, b.pregnancy_category, b.pediatric_warning, b.geriatric_warning,
           'barcode'::text AS match_type, 1.0::real AS score
    FROM base b JOIN public.global_barcodes bc ON bc.global_medicine_id = b.id
    WHERE (SELECT s FROM q) <> '' AND bc.barcode = (SELECT s FROM q)
    UNION ALL
    SELECT b.id, b.brand_name, b.generic_name, b.manufacturer_name, b.strength, b.dosage_form,
           b.prescription_required, b.otc_allowed, b.pregnancy_category, b.pediatric_warning, b.geriatric_warning,
           'alias'::text, 0.95::real
    FROM base b JOIN public.global_medicine_aliases a ON a.global_medicine_id = b.id
    WHERE (SELECT s FROM q) <> '' AND a.alias ILIKE (SELECT s FROM q) || '%'
    UNION ALL
    SELECT b.id, b.brand_name, b.generic_name, b.manufacturer_name, b.strength, b.dosage_form,
           b.prescription_required, b.otc_allowed, b.pregnancy_category, b.pediatric_warning, b.geriatric_warning,
           'fts'::text, ts_rank(b.search_tsv, plainto_tsquery('simple', (SELECT s FROM q)))::real
    FROM base b
    WHERE (SELECT s FROM q) <> '' AND b.search_tsv @@ plainto_tsquery('simple', (SELECT s FROM q))
    UNION ALL
    SELECT b.id, b.brand_name, b.generic_name, b.manufacturer_name, b.strength, b.dosage_form,
           b.prescription_required, b.otc_allowed, b.pregnancy_category, b.pediatric_warning, b.geriatric_warning,
           'prefix'::text, 0.4::real
    FROM base b
    WHERE (SELECT s FROM q) <> '' AND (
      b.brand_name ILIKE (SELECT s FROM q) || '%' OR
      COALESCE(b.generic_name,'') ILIKE (SELECT s FROM q) || '%' OR
      COALESCE(b.manufacturer_name,'') ILIKE (SELECT s FROM q) || '%'
    )
    UNION ALL
    SELECT b.id, b.brand_name, b.generic_name, b.manufacturer_name, b.strength, b.dosage_form,
           b.prescription_required, b.otc_allowed, b.pregnancy_category, b.pediatric_warning, b.geriatric_warning,
           'contains'::text, 0.2::real
    FROM base b
    WHERE (SELECT s FROM q) <> '' AND (
      b.brand_name ILIKE '%' || (SELECT s FROM q) || '%' OR
      COALESCE(b.generic_name,'') ILIKE '%' || (SELECT s FROM q) || '%'
    )
    UNION ALL
    SELECT b.id, b.brand_name, b.generic_name, b.manufacturer_name, b.strength, b.dosage_form,
           b.prescription_required, b.otc_allowed, b.pregnancy_category, b.pediatric_warning, b.geriatric_warning,
           'all'::text, 0::real
    FROM base b WHERE (SELECT s FROM q) = ''
  ) u
  ORDER BY id, score DESC
  LIMIT GREATEST(1, LEAST(_limit, 100));
$$;
GRANT EXECUTE ON FUNCTION public.smart_medicine_search(text, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_alternative_suggestions(_medicine_id uuid)
RETURNS TABLE(
  alternative_id uuid, brand_name text, generic_name text, manufacturer_name text,
  strength text, dosage_form text, priority int, confidence real, reason text
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH src AS (SELECT id, generic_id, strength, dosage_form FROM public.global_medicines WHERE id = _medicine_id),
  src_classes AS (SELECT therapeutic_class_id FROM public.global_medicine_therapeutic_classes WHERE medicine_id = _medicine_id)
  SELECT DISTINCT ON (alternative_id) * FROM (
    SELECT m.id AS alternative_id, m.brand_name, gg.name AS generic_name, gmf.name AS manufacturer_name,
           m.strength, m.dosage_form, 1::int AS priority, 1.0::real AS confidence, 'curated'::text AS reason
    FROM public.global_medicine_alternatives a
    JOIN public.global_medicines m ON m.id = a.alternative_medicine_id
    LEFT JOIN public.global_generics gg ON gg.id = m.generic_id
    LEFT JOIN public.global_manufacturers gmf ON gmf.id = m.manufacturer_id
    WHERE a.source_medicine_id = _medicine_id AND a.approved = true
    UNION ALL
    SELECT m.id, m.brand_name, gg.name, gmf.name, m.strength, m.dosage_form,
           1::int, 0.95::real, 'same_generic_strength_form'::text
    FROM public.global_medicines m
    JOIN src s ON m.generic_id = s.generic_id
    LEFT JOIN public.global_generics gg ON gg.id = m.generic_id
    LEFT JOIN public.global_manufacturers gmf ON gmf.id = m.manufacturer_id
    WHERE m.id <> _medicine_id AND m.generic_id IS NOT NULL
      AND COALESCE(m.strength,'') = COALESCE(s.strength,'')
      AND COALESCE(m.dosage_form,'') = COALESCE(s.dosage_form,'')
    UNION ALL
    SELECT m.id, m.brand_name, gg.name, gmf.name, m.strength, m.dosage_form,
           2::int, 0.75::real, 'same_generic'::text
    FROM public.global_medicines m
    JOIN src s ON m.generic_id = s.generic_id
    LEFT JOIN public.global_generics gg ON gg.id = m.generic_id
    LEFT JOIN public.global_manufacturers gmf ON gmf.id = m.manufacturer_id
    WHERE m.id <> _medicine_id AND m.generic_id IS NOT NULL
    UNION ALL
    SELECT m.id, m.brand_name, gg.name, gmf.name, m.strength, m.dosage_form,
           3::int, 0.5::real, 'same_therapeutic_class'::text
    FROM public.global_medicine_therapeutic_classes tc
    JOIN public.global_medicines m ON m.id = tc.medicine_id
    LEFT JOIN public.global_generics gg ON gg.id = m.generic_id
    LEFT JOIN public.global_manufacturers gmf ON gmf.id = m.manufacturer_id
    WHERE tc.therapeutic_class_id IN (SELECT therapeutic_class_id FROM src_classes)
      AND m.id <> _medicine_id
  ) u
  ORDER BY alternative_id, priority ASC, confidence DESC
  LIMIT 50;
$$;
GRANT EXECUTE ON FUNCTION public.get_alternative_suggestions(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_clinical_dashboard()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_medicines', (SELECT count(*) FROM public.global_medicines),
    'prescription_medicines', (SELECT count(*) FROM public.global_medicines WHERE prescription_required = true),
    'otc_medicines', (SELECT count(*) FROM public.global_medicines WHERE otc_allowed = true),
    'pregnancy_risk_medicines', (SELECT count(*) FROM public.global_medicines WHERE pregnancy_category IN ('D','X')),
    'total_alternatives', (SELECT count(*) FROM public.global_medicine_alternatives WHERE approved = true),
    'total_interactions', (SELECT count(*) FROM public.global_drug_interactions),
    'total_contraindications', (SELECT count(*) FROM public.global_contraindications),
    'clinical_coverage_pct', (
      SELECT CASE WHEN count(*) = 0 THEN 0
        ELSE round(100.0 * count(*) FILTER (
          WHERE EXISTS (SELECT 1 FROM public.global_dosage_guides g WHERE g.medicine_id = m.id)
             OR EXISTS (SELECT 1 FROM public.global_contraindications c WHERE c.medicine_id = m.id)
             OR EXISTS (SELECT 1 FROM public.global_medicine_therapeutic_classes t WHERE t.medicine_id = m.id)
        ) / count(*), 2) END
      FROM public.global_medicines m
    ),
    'top_interacted', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT m.id, m.brand_name, count(*) AS interaction_count
        FROM public.global_drug_interactions i
        JOIN public.global_medicines m ON m.id IN (i.medicine_a, i.medicine_b)
        GROUP BY m.id, m.brand_name ORDER BY interaction_count DESC LIMIT 10
      ) t
    ),
    'top_alternatives', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT m.id, m.brand_name, count(*) AS alt_count
        FROM public.global_medicine_alternatives a
        JOIN public.global_medicines m ON m.id = a.source_medicine_id
        WHERE a.approved = true
        GROUP BY m.id, m.brand_name ORDER BY alt_count DESC LIMIT 10
      ) t
    ),
    'high_risk', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT m.id, m.brand_name, m.pregnancy_category
        FROM public.global_medicines m
        WHERE m.pregnancy_category IN ('D','X')
           OR m.pediatric_warning IS NOT NULL
           OR m.geriatric_warning IS NOT NULL
        LIMIT 20
      ) t
    )
  ) INTO result;
  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_clinical_dashboard() TO authenticated;

CREATE OR REPLACE FUNCTION public.score_contribution_quality(_contribution_id uuid)
RETURNS int LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE c record; score int := 0; payload jsonb;
BEGIN
  SELECT * INTO c FROM public.global_medicine_contributions WHERE id = _contribution_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  payload := c.proposed_data;
  IF (payload ->> 'generic_name') IS NOT NULL AND length(payload->>'generic_name') > 1 THEN score := score + 25; END IF;
  IF (payload ->> 'manufacturer_name') IS NOT NULL AND length(payload->>'manufacturer_name') > 1 THEN score := score + 20; END IF;
  IF (payload ->> 'strength') IS NOT NULL AND length(payload->>'strength') > 0 THEN score := score + 20; END IF;
  IF (payload ->> 'dosage_form') IS NOT NULL AND length(payload->>'dosage_form') > 0 THEN score := score + 15; END IF;
  IF (payload ->> 'brand_name') IS NOT NULL AND length(payload->>'brand_name') > 1 THEN score := score + 10; END IF;
  IF EXISTS (SELECT 1 FROM public.global_medicines m WHERE lower(m.brand_name) = lower(coalesce(payload->>'brand_name',''))) THEN
    score := GREATEST(0, score - 20);
  END IF;
  IF EXISTS (SELECT 1 FROM public.global_generics g WHERE lower(g.name) = lower(coalesce(payload->>'generic_name',''))) THEN
    score := score + 10;
  END IF;
  RETURN LEAST(100, GREATEST(0, score));
END;
$$;
GRANT EXECUTE ON FUNCTION public.score_contribution_quality(uuid) TO authenticated;
