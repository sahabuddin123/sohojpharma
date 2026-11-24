
-- Step 1: generics
INSERT INTO public.global_generics(name)
SELECT DISTINCT initcap(public.norm_text(g.name))
FROM public.generics g
WHERE g.deleted_at IS NULL AND public.norm_text(g.name) IS NOT NULL
ON CONFLICT (name) DO NOTHING;

-- Step 2: manufacturers
INSERT INTO public.global_manufacturers(name)
SELECT DISTINCT initcap(public.norm_text(m.name))
FROM public.manufacturers m
WHERE m.deleted_at IS NULL AND public.norm_text(m.name) IS NOT NULL
ON CONFLICT (name) DO NOTHING;

-- Step 3: medicines
INSERT INTO public.global_medicines(brand_name, generic_id, manufacturer_id, strength, dosage_form, approved)
SELECT DISTINCT
  initcap(public.norm_text(p.name)),
  gg.id, gmf.id,
  public.norm_text(p.strength),
  public.norm_text(p.medicine_type),
  true
FROM public.products p
LEFT JOIN public.generics g ON g.id = p.generic_id
LEFT JOIN public.manufacturers m ON m.id = p.manufacturer_id
LEFT JOIN public.global_generics gg ON gg.name = initcap(public.norm_text(g.name))
LEFT JOIN public.global_manufacturers gmf ON gmf.name = initcap(public.norm_text(m.name))
WHERE p.deleted_at IS NULL AND public.norm_text(p.name) IS NOT NULL
ON CONFLICT (brand_name, generic_id, manufacturer_id, strength, dosage_form) DO NOTHING;

-- Step 4: link products (exact match)
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
)
UPDATE public.products p SET global_medicine_id = mt.gmid
FROM matched mt WHERE p.id = mt.pid;

-- Step 5: contributions + reviews for unlinked
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
  LIMIT 20000
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
)
INSERT INTO public.global_medicine_contributions(tenant_id, product_id, proposed_data, status)
SELECT tenant_id, pid,
       jsonb_build_object('brand_name', brand, 'generic_name', gen, 'manufacturer_name', mfr, 'strength', str, 'dosage_form', dform),
       'pending'
FROM scored
WHERE sug IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.global_medicine_contributions c WHERE c.product_id = scored.pid AND c.status='pending');

-- Step 6: barcodes
WITH agg AS (
  SELECT pb.barcode,
         COUNT(DISTINCT p.global_medicine_id) AS distinct_meds,
         (array_agg(DISTINCT p.global_medicine_id))[1] AS one_med
  FROM public.product_barcodes pb
  JOIN public.products p ON p.id = pb.product_id
  WHERE pb.deleted_at IS NULL
    AND p.global_medicine_id IS NOT NULL
    AND pb.barcode ~ '^[0-9A-Za-z]+$'
  GROUP BY pb.barcode
)
INSERT INTO public.global_barcodes(barcode, global_medicine_id, barcode_type, verified)
SELECT barcode, one_med, 'EAN13', false FROM agg WHERE distinct_meds = 1
ON CONFLICT (barcode) DO NOTHING;
