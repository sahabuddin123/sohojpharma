
-- Patch RPC: MAX(uuid) does not exist; use array_agg
CREATE OR REPLACE FUNCTION public.migrate_global_barcodes()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_ins int := 0; v_conf int := 0;
BEGIN
  IF NOT public.is_app_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

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
  ),
  ok AS (SELECT barcode, one_med AS gmid FROM agg WHERE distinct_meds = 1),
  ins AS (
    INSERT INTO public.global_barcodes(barcode, global_medicine_id, barcode_type, verified)
    SELECT barcode, gmid, 'EAN13', false FROM ok
    ON CONFLICT (barcode) DO NOTHING
    RETURNING 1
  ) SELECT count(*) INTO v_ins FROM ins;

  SELECT count(*) INTO v_conf FROM (
    SELECT pb.barcode FROM public.product_barcodes pb
    JOIN public.products p ON p.id = pb.product_id
    WHERE pb.deleted_at IS NULL AND p.global_medicine_id IS NOT NULL
    GROUP BY pb.barcode
    HAVING COUNT(DISTINCT p.global_medicine_id) > 1
  ) c;

  RETURN jsonb_build_object('barcodes_inserted', v_ins, 'conflicting_barcodes', v_conf);
END $function$;

-- Execute barcode migration inline (admin gate bypassed via migration superuser)
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
