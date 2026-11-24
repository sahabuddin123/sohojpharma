
-- ============================================================
-- Phase 3.3 — Global Catalog Backfill & Auto Matching Engine
-- ============================================================

-- 0) Normalization helper -------------------------------------------------
CREATE OR REPLACE FUNCTION public.norm_text(t text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT NULLIF(btrim(regexp_replace(lower(coalesce(t,'')), '\s+', ' ', 'g')), '')
$$;

-- 1) Tighten global_medicines unique key so NULLs collapse ----------------
ALTER TABLE public.global_medicines
  DROP CONSTRAINT IF EXISTS global_medicines_identity_uniq;
ALTER TABLE public.global_medicines
  ADD CONSTRAINT global_medicines_identity_uniq
  UNIQUE NULLS NOT DISTINCT (brand_name, generic_id, manufacturer_id, strength, dosage_form);

-- 2) Match review queue ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.global_match_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  suggested_global_medicine_id uuid REFERENCES public.global_medicines(id) ON DELETE SET NULL,
  confidence numeric NOT NULL DEFAULT 0,
  match_level int NOT NULL DEFAULT 3,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS gmr_pending_uniq
  ON public.global_match_reviews(product_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS gmr_status_conf_idx
  ON public.global_match_reviews(status, confidence DESC);
CREATE INDEX IF NOT EXISTS gmr_tenant_idx
  ON public.global_match_reviews(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.global_match_reviews TO authenticated;
GRANT ALL ON public.global_match_reviews TO service_role;
ALTER TABLE public.global_match_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gmr_admin_all ON public.global_match_reviews;
CREATE POLICY gmr_admin_all ON public.global_match_reviews
  FOR ALL TO authenticated
  USING (public.is_app_admin(auth.uid()))
  WITH CHECK (public.is_app_admin(auth.uid()));

DROP POLICY IF EXISTS gmr_tenant_read ON public.global_match_reviews;
CREATE POLICY gmr_tenant_read ON public.global_match_reviews
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

DROP TRIGGER IF EXISTS trg_gmr_touch ON public.global_match_reviews;
CREATE TRIGGER trg_gmr_touch BEFORE UPDATE ON public.global_match_reviews
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3) Backfill engine ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.backfill_global_catalog()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_gen int := 0; v_mfr int := 0; v_med int := 0;
BEGIN
  IF NOT public.is_app_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  WITH src AS (
    SELECT DISTINCT initcap(public.norm_text(g.name)) AS name
    FROM public.generics g
    WHERE g.deleted_at IS NULL AND public.norm_text(g.name) IS NOT NULL
  ), ins AS (
    INSERT INTO public.global_generics(name)
    SELECT name FROM src
    ON CONFLICT (name) DO NOTHING
    RETURNING 1
  ) SELECT count(*) INTO v_gen FROM ins;

  WITH src AS (
    SELECT DISTINCT initcap(public.norm_text(m.name)) AS name
    FROM public.manufacturers m
    WHERE m.deleted_at IS NULL AND public.norm_text(m.name) IS NOT NULL
  ), ins AS (
    INSERT INTO public.global_manufacturers(name)
    SELECT name FROM src
    ON CONFLICT (name) DO NOTHING
    RETURNING 1
  ) SELECT count(*) INTO v_mfr FROM ins;

  WITH src AS (
    SELECT DISTINCT
      initcap(public.norm_text(p.name)) AS brand_name,
      gg.id AS generic_id,
      gmf.id AS manufacturer_id,
      public.norm_text(p.strength) AS strength,
      public.norm_text(p.medicine_type) AS dosage_form
    FROM public.products p
    LEFT JOIN public.generics g ON g.id = p.generic_id
    LEFT JOIN public.manufacturers m ON m.id = p.manufacturer_id
    LEFT JOIN public.global_generics gg ON gg.name = initcap(public.norm_text(g.name))
    LEFT JOIN public.global_manufacturers gmf ON gmf.name = initcap(public.norm_text(m.name))
    WHERE p.deleted_at IS NULL AND public.norm_text(p.name) IS NOT NULL
  ), ins AS (
    INSERT INTO public.global_medicines(brand_name, generic_id, manufacturer_id, strength, dosage_form, approved)
    SELECT brand_name, generic_id, manufacturer_id, strength, dosage_form, true FROM src
    ON CONFLICT (brand_name, generic_id, manufacturer_id, strength, dosage_form) DO NOTHING
    RETURNING 1
  ) SELECT count(*) INTO v_med FROM ins;

  RETURN jsonb_build_object(
    'global_generics_created', v_gen,
    'global_manufacturers_created', v_mfr,
    'global_medicines_created', v_med
  );
END $$;

-- 4) Product linker -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.link_products_to_global()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_linked int := 0; v_unlinked int := 0;
BEGIN
  IF NOT public.is_app_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  WITH cand AS (
    SELECT p.id AS pid,
           initcap(public.norm_text(p.name)) AS brand,
           initcap(public.norm_text(g.name)) AS gen,
           initcap(public.norm_text(m.name)) AS mfr,
           public.norm_text(p.strength) AS str,
           public.norm_text(p.medicine_type) AS dform
    FROM public.products p
    LEFT JOIN public.generics g ON g.id = p.generic_id
    LEFT JOIN public.manufacturers m ON m.id = p.manufacturer_id
    WHERE p.deleted_at IS NULL AND p.global_medicine_id IS NULL
  ),
  matched AS (
    SELECT DISTINCT ON (c.pid) c.pid, gm.id AS gmid
    FROM cand c
    LEFT JOIN public.global_generics gg ON gg.name = c.gen
    LEFT JOIN public.global_manufacturers gmf ON gmf.name = c.mfr
    JOIN public.global_medicines gm
      ON gm.brand_name = c.brand
     AND gm.generic_id IS NOT DISTINCT FROM gg.id
     AND gm.manufacturer_id IS NOT DISTINCT FROM gmf.id
     AND gm.strength IS NOT DISTINCT FROM c.str
     AND gm.dosage_form IS NOT DISTINCT FROM c.dform
    WHERE c.brand IS NOT NULL
  ),
  upd AS (
    UPDATE public.products p SET global_medicine_id = mt.gmid
    FROM matched mt WHERE p.id = mt.pid
    RETURNING 1
  ) SELECT count(*) INTO v_linked FROM upd;

  SELECT count(*) INTO v_unlinked
    FROM public.products
    WHERE deleted_at IS NULL AND global_medicine_id IS NULL;

  RETURN jsonb_build_object('linked_count', v_linked, 'unlinked_count', v_unlinked);
END $$;

-- 5) Per-product match finder --------------------------------------------
CREATE OR REPLACE FUNCTION public.find_global_match(_product_id uuid)
RETURNS TABLE(global_medicine_id uuid, confidence numeric, match_level int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_brand text; v_gen text; v_mfr text; v_str text; v_form text;
BEGIN
  IF NOT public.is_app_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT initcap(public.norm_text(p.name)),
         initcap(public.norm_text(g.name)),
         initcap(public.norm_text(m.name)),
         public.norm_text(p.strength),
         public.norm_text(p.medicine_type)
    INTO v_brand, v_gen, v_mfr, v_str, v_form
  FROM public.products p
  LEFT JOIN public.generics g ON g.id = p.generic_id
  LEFT JOIN public.manufacturers m ON m.id = p.manufacturer_id
  WHERE p.id = _product_id;

  -- Level 1: exact identity
  RETURN QUERY
    SELECT gm.id, 1.0::numeric, 1
    FROM public.global_medicines gm
    LEFT JOIN public.global_generics gg ON gg.id = gm.generic_id
    LEFT JOIN public.global_manufacturers gmf ON gmf.id = gm.manufacturer_id
    WHERE gm.brand_name = v_brand
      AND gg.name IS NOT DISTINCT FROM v_gen
      AND gmf.name IS NOT DISTINCT FROM v_mfr
      AND gm.strength IS NOT DISTINCT FROM v_str
      AND gm.dosage_form IS NOT DISTINCT FROM v_form
    LIMIT 1;
  IF FOUND THEN RETURN; END IF;

  -- Level 2: normalized brand + generic
  RETURN QUERY
    SELECT gm.id, 0.8::numeric, 2
    FROM public.global_medicines gm
    LEFT JOIN public.global_generics gg ON gg.id = gm.generic_id
    WHERE gm.brand_name = v_brand
      AND gg.name IS NOT DISTINCT FROM v_gen
    LIMIT 1;
  IF FOUND THEN RETURN; END IF;

  -- Level 3: trigram on brand
  RETURN QUERY
    SELECT gm.id,
           extensions.similarity(gm.brand_name, v_brand)::numeric,
           3
    FROM public.global_medicines gm
    WHERE v_brand IS NOT NULL
      AND extensions.similarity(gm.brand_name, v_brand) > 0.4
    ORDER BY extensions.similarity(gm.brand_name, v_brand) DESC
    LIMIT 1;
END $$;

-- 6) Seed contributions + review queue for unlinked products -------------
CREATE OR REPLACE FUNCTION public.seed_global_contributions(_limit int DEFAULT 10000)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rev int := 0; v_con int := 0;
BEGIN
  IF NOT public.is_app_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  WITH unlinked AS (
    SELECT p.id AS pid, p.tenant_id,
           initcap(public.norm_text(p.name)) AS brand,
           initcap(public.norm_text(g.name)) AS gen,
           initcap(public.norm_text(m.name)) AS mfr,
           public.norm_text(p.strength) AS str,
           public.norm_text(p.medicine_type) AS dform
    FROM public.products p
    LEFT JOIN public.generics g ON g.id = p.generic_id
    LEFT JOIN public.manufacturers m ON m.id = p.manufacturer_id
    WHERE p.deleted_at IS NULL AND p.global_medicine_id IS NULL
      AND public.norm_text(p.name) IS NOT NULL
    LIMIT _limit
  ),
  scored AS (
    SELECT u.*,
      (SELECT gm.id FROM public.global_medicines gm
        WHERE extensions.similarity(gm.brand_name, u.brand) > 0.5
        ORDER BY extensions.similarity(gm.brand_name, u.brand) DESC LIMIT 1) AS sug,
      COALESCE((SELECT extensions.similarity(gm.brand_name, u.brand) FROM public.global_medicines gm
        WHERE extensions.similarity(gm.brand_name, u.brand) > 0.5
        ORDER BY extensions.similarity(gm.brand_name, u.brand) DESC LIMIT 1), 0) AS conf
    FROM unlinked u
  ),
  rev_ins AS (
    INSERT INTO public.global_match_reviews(product_id, tenant_id, suggested_global_medicine_id, confidence, match_level, status)
    SELECT pid, tenant_id, sug, conf, 3, 'pending'
    FROM scored WHERE sug IS NOT NULL
    ON CONFLICT (product_id) WHERE status='pending' DO NOTHING
    RETURNING 1
  ),
  con_ins AS (
    INSERT INTO public.global_medicine_contributions(tenant_id, product_id, proposed_data, status)
    SELECT tenant_id, pid,
           jsonb_build_object(
             'brand_name', brand,
             'generic_name', gen,
             'manufacturer_name', mfr,
             'strength', str,
             'dosage_form', dform
           ),
           'pending'
    FROM scored
    WHERE sug IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.global_medicine_contributions c
        WHERE c.product_id = scored.pid AND c.status='pending'
      )
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM rev_ins), (SELECT count(*) FROM con_ins) INTO v_rev, v_con;

  RETURN jsonb_build_object('reviews_created', v_rev, 'contributions_created', v_con);
END $$;

-- 7) Approve / reject / bulk approve match reviews -----------------------
CREATE OR REPLACE FUNCTION public.approve_match_review(_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pid uuid; v_gmid uuid;
BEGIN
  IF NOT public.is_app_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT product_id, suggested_global_medicine_id INTO v_pid, v_gmid
    FROM public.global_match_reviews WHERE id = _id AND status='pending';
  IF v_pid IS NULL THEN RAISE EXCEPTION 'review not found or not pending'; END IF;
  IF v_gmid IS NULL THEN RAISE EXCEPTION 'no suggested medicine'; END IF;
  UPDATE public.products SET global_medicine_id = v_gmid WHERE id = v_pid;
  UPDATE public.global_match_reviews
    SET status='approved', reviewed_by=auth.uid(), reviewed_at=now()
    WHERE id = _id;
  RETURN v_gmid;
END $$;

CREATE OR REPLACE FUNCTION public.reject_match_review(_id uuid, _notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_app_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.global_match_reviews
    SET status='rejected', reviewed_by=auth.uid(), reviewed_at=now(), notes=_notes
    WHERE id = _id AND status='pending';
END $$;

CREATE OR REPLACE FUNCTION public.bulk_approve_match_reviews(_min_confidence numeric DEFAULT 0.85)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int := 0;
BEGIN
  IF NOT public.is_app_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  WITH eligible AS (
    SELECT id, product_id, suggested_global_medicine_id
    FROM public.global_match_reviews
    WHERE status='pending'
      AND confidence >= _min_confidence
      AND suggested_global_medicine_id IS NOT NULL
  ),
  upd_p AS (
    UPDATE public.products p
      SET global_medicine_id = e.suggested_global_medicine_id
    FROM eligible e WHERE p.id = e.product_id
    RETURNING p.id
  ),
  upd_r AS (
    UPDATE public.global_match_reviews r
      SET status='approved', reviewed_by=auth.uid(), reviewed_at=now()
    FROM eligible e WHERE r.id = e.id
    RETURNING r.id
  )
  SELECT count(*) INTO v_n FROM upd_r;
  RETURN v_n;
END $$;

-- 8) Barcode migration ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.migrate_global_barcodes()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ins int := 0; v_conf int := 0;
BEGIN
  IF NOT public.is_app_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  WITH agg AS (
    SELECT pb.barcode,
           COUNT(DISTINCT p.global_medicine_id) AS distinct_meds,
           MAX(p.global_medicine_id) AS one_med
    FROM public.product_barcodes pb
    JOIN public.products p ON p.id = pb.product_id
    WHERE pb.deleted_at IS NULL
      AND p.global_medicine_id IS NOT NULL
      AND pb.barcode ~ '^[0-9A-Za-z]+$'
    GROUP BY pb.barcode
  ),
  ok AS (
    SELECT barcode, one_med AS gmid FROM agg WHERE distinct_meds = 1
  ),
  ins AS (
    INSERT INTO public.global_barcodes(barcode, global_medicine_id, barcode_type, verified)
    SELECT barcode, gmid, 'EAN13', false FROM ok
    ON CONFLICT (barcode) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_ins FROM ins;

  SELECT count(*) INTO v_conf FROM (
    SELECT pb.barcode
    FROM public.product_barcodes pb
    JOIN public.products p ON p.id = pb.product_id
    WHERE pb.deleted_at IS NULL AND p.global_medicine_id IS NOT NULL
    GROUP BY pb.barcode
    HAVING COUNT(DISTINCT p.global_medicine_id) > 1
  ) c;

  RETURN jsonb_build_object('barcodes_inserted', v_ins, 'conflicting_barcodes', v_conf);
END $$;

-- 9) Duplicate report view ------------------------------------------------
CREATE OR REPLACE VIEW public.global_catalog_duplicate_report AS
  SELECT 'medicine'::text AS kind, lower(brand_name) AS key, count(*)::bigint AS cnt
  FROM public.global_medicines GROUP BY 2 HAVING count(*) > 1
  UNION ALL
  SELECT 'manufacturer', lower(name), count(*)
  FROM public.global_manufacturers GROUP BY 2 HAVING count(*) > 1
  UNION ALL
  SELECT 'generic', lower(name), count(*)
  FROM public.global_generics GROUP BY 2 HAVING count(*) > 1
  UNION ALL
  SELECT 'barcode', barcode, count(*)
  FROM public.global_barcodes GROUP BY 2 HAVING count(*) > 1;

GRANT SELECT ON public.global_catalog_duplicate_report TO authenticated;

-- 10) Extended metrics ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.catalog_backfill_metrics()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.is_app_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'global_medicines',     (SELECT count(*) FROM public.global_medicines),
    'global_generics',      (SELECT count(*) FROM public.global_generics),
    'global_manufacturers', (SELECT count(*) FROM public.global_manufacturers),
    'global_barcodes',      (SELECT count(*) FROM public.global_barcodes),
    'linked_products',      (SELECT count(*) FROM public.products WHERE deleted_at IS NULL AND global_medicine_id IS NOT NULL),
    'unlinked_products',    (SELECT count(*) FROM public.products WHERE deleted_at IS NULL AND global_medicine_id IS NULL),
    'pending_reviews',      (SELECT count(*) FROM public.global_match_reviews WHERE status='pending'),
    'pending_contributions',(SELECT count(*) FROM public.global_medicine_contributions WHERE status='pending'),
    'duplicates',           (SELECT count(*) FROM public.global_catalog_duplicate_report)
  ) INTO v;
  RETURN v;
END $$;
