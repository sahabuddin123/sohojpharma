DROP FUNCTION IF EXISTS public.catalog_backfill_metrics();

CREATE OR REPLACE FUNCTION public.catalog_backfill_metrics()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'global_medicines', (SELECT count(*) FROM global_medicines),
    'approved_medicines', (SELECT count(*) FROM global_medicines WHERE approved = true),
    'global_generics', (SELECT count(*) FROM global_generics),
    'global_manufacturers', (SELECT count(*) FROM global_manufacturers),
    'global_barcodes', (SELECT count(*) FROM global_barcodes),
    'linked_products', (SELECT count(*) FROM products WHERE global_medicine_id IS NOT NULL AND deleted_at IS NULL),
    'unlinked_products', (SELECT count(*) FROM products WHERE global_medicine_id IS NULL AND deleted_at IS NULL),
    'pending_reviews', (SELECT count(*) FROM global_match_reviews WHERE status = 'pending'),
    'pending_contributions', (SELECT count(*) FROM global_medicine_contributions WHERE status = 'pending')
  );
$$;

GRANT EXECUTE ON FUNCTION public.catalog_backfill_metrics() TO authenticated;