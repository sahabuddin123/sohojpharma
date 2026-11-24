CREATE INDEX IF NOT EXISTS idx_products_unlinked_active
  ON public.products (id)
  WHERE deleted_at IS NULL AND global_medicine_id IS NULL;

CREATE OR REPLACE FUNCTION public.push_global_catalog_to_all_tenants(_limit integer DEFAULT 2000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_linked integer := 0;
  v_remaining bigint := 0;
BEGIN
  IF NOT public.is_app_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('statement_timeout', '55000', true);

  WITH cand AS (
    SELECT p.id, p.name, p.generic_id, p.manufacturer_id, p.strength, p.medicine_type
    FROM public.products p
    WHERE p.deleted_at IS NULL AND p.global_medicine_id IS NULL
    ORDER BY p.id
    LIMIT GREATEST(_limit, 1)
  ), resolved AS (
    SELECT c.id,
           initcap(public.norm_text(c.name)) AS brand,
           gg.id AS gen_id,
           gmf.id AS mfr_id,
           public.norm_text(c.strength) AS str,
           public.norm_text(c.medicine_type) AS dform
    FROM cand c
    LEFT JOIN public.generics g ON g.id = c.generic_id
    LEFT JOIN public.manufacturers m ON m.id = c.manufacturer_id
    LEFT JOIN public.global_generics gg ON gg.name = initcap(public.norm_text(g.name))
    LEFT JOIN public.global_manufacturers gmf ON gmf.name = initcap(public.norm_text(m.name))
  ), matched AS (
    SELECT DISTINCT ON (r.id) r.id, gm.id AS gmid
    FROM resolved r
    JOIN public.global_medicines gm
      ON gm.brand_name = r.brand
     AND gm.generic_id IS NOT DISTINCT FROM r.gen_id
     AND gm.manufacturer_id IS NOT DISTINCT FROM r.mfr_id
     AND gm.strength IS NOT DISTINCT FROM r.str
     AND gm.dosage_form IS NOT DISTINCT FROM r.dform
    WHERE r.brand IS NOT NULL
    ORDER BY r.id, gm.created_at
  )
  UPDATE public.products p
  SET global_medicine_id = mt.gmid
  FROM matched mt
  WHERE p.id = mt.id;

  GET DIAGNOSTICS v_linked = ROW_COUNT;

  SELECT count(*) INTO v_remaining
  FROM public.products
  WHERE deleted_at IS NULL AND global_medicine_id IS NULL;

  RETURN jsonb_build_object(
    'success', true,
    'linked_count', v_linked,
    'unlinked_remaining', v_remaining,
    'done', v_linked = 0
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.push_global_catalog_to_all_tenants(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.push_global_catalog_to_all_tenants(integer) TO authenticated, service_role;
DROP FUNCTION IF EXISTS public.push_global_catalog_to_all_tenants();