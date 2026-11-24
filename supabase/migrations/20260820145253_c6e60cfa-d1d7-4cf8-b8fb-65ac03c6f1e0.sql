CREATE OR REPLACE FUNCTION public.catalog_sync_chunk(_limit int DEFAULT 1000, _after uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_gen int := 0; v_mfr int := 0; v_med int := 0; v_linked int := 0;
  v_processed int := 0; v_next uuid; v_remaining bigint;
BEGIN
  IF NOT public.is_app_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('statement_timeout', '55000', true);

  IF _after IS NULL THEN
    WITH src AS (
      SELECT DISTINCT initcap(public.norm_text(g.name)) AS name
      FROM public.generics g
      WHERE g.deleted_at IS NULL AND public.norm_text(g.name) IS NOT NULL
    ), ins AS (
      INSERT INTO public.global_generics(name)
      SELECT name FROM src ON CONFLICT (name) DO NOTHING RETURNING 1
    ) SELECT count(*) INTO v_gen FROM ins;

    WITH src AS (
      SELECT DISTINCT initcap(public.norm_text(m.name)) AS name
      FROM public.manufacturers m
      WHERE m.deleted_at IS NULL AND public.norm_text(m.name) IS NOT NULL
    ), ins AS (
      INSERT INTO public.global_manufacturers(name)
      SELECT name FROM src ON CONFLICT (name) DO NOTHING RETURNING 1
    ) SELECT count(*) INTO v_mfr FROM ins;
  END IF;

  CREATE TEMP TABLE _chunk ON COMMIT DROP AS
  SELECT p.id AS pid,
         initcap(public.norm_text(p.name)) AS brand,
         initcap(public.norm_text(g.name)) AS gen,
         initcap(public.norm_text(m.name)) AS mfr,
         public.norm_text(p.strength) AS str,
         public.norm_text(p.medicine_type) AS dform
  FROM (
    SELECT * FROM public.products
    WHERE deleted_at IS NULL AND (_after IS NULL OR id > _after)
    ORDER BY id
    LIMIT _limit
  ) p
  LEFT JOIN public.generics g ON g.id = p.generic_id
  LEFT JOIN public.manufacturers m ON m.id = p.manufacturer_id;

  SELECT count(*), max(pid) INTO v_processed, v_next FROM _chunk;

  IF v_processed = 0 THEN
    SELECT count(*) INTO v_remaining FROM public.products WHERE deleted_at IS NULL AND global_medicine_id IS NULL;
    DROP TABLE IF EXISTS _chunk;
    RETURN jsonb_build_object('processed', 0, 'next_cursor', NULL, 'medicines_created', 0,
      'generics_created', v_gen, 'manufacturers_created', v_mfr, 'linked', 0, 'unlinked_remaining', v_remaining, 'done', true);
  END IF;

  WITH src AS (
    SELECT DISTINCT c.brand AS brand_name, gg.id AS generic_id, gmf.id AS manufacturer_id, c.str AS strength, c.dform AS dosage_form
    FROM _chunk c
    LEFT JOIN public.global_generics gg ON gg.name = c.gen
    LEFT JOIN public.global_manufacturers gmf ON gmf.name = c.mfr
    WHERE c.brand IS NOT NULL
  ), ins AS (
    INSERT INTO public.global_medicines(brand_name, generic_id, manufacturer_id, strength, dosage_form, approved)
    SELECT brand_name, generic_id, manufacturer_id, strength, dosage_form, true FROM src
    ON CONFLICT (brand_name, generic_id, manufacturer_id, strength, dosage_form) DO NOTHING
    RETURNING 1
  ) SELECT count(*) INTO v_med FROM ins;

  WITH matched AS (
    SELECT DISTINCT ON (c.pid) c.pid, gm.id AS gmid
    FROM _chunk c
    LEFT JOIN public.global_generics gg ON gg.name = c.gen
    LEFT JOIN public.global_manufacturers gmf ON gmf.name = c.mfr
    JOIN public.global_medicines gm
      ON gm.brand_name = c.brand
     AND gm.generic_id IS NOT DISTINCT FROM gg.id
     AND gm.manufacturer_id IS NOT DISTINCT FROM gmf.id
     AND gm.strength IS NOT DISTINCT FROM c.str
     AND gm.dosage_form IS NOT DISTINCT FROM c.dform
    WHERE c.brand IS NOT NULL
  ), upd AS (
    UPDATE public.products p SET global_medicine_id = matched.gmid
    FROM matched
    WHERE p.id = matched.pid AND p.global_medicine_id IS DISTINCT FROM matched.gmid
    RETURNING 1
  ) SELECT count(*) INTO v_linked FROM upd;

  DROP TABLE IF EXISTS _chunk;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'next_cursor', v_next,
    'medicines_created', v_med,
    'generics_created', v_gen,
    'manufacturers_created', v_mfr,
    'linked', v_linked,
    'done', v_processed < _limit
  );
END $$;