-- FIX #1 backfill: pick one opening batch per (tenant, product) and flag it.
WITH candidates AS (
  SELECT DISTINCT ON (tenant_id, product_id) id
    FROM public.batches
   WHERE COALESCE(is_opening, false) = false
     AND (batch_no LIKE 'OPN-%' OR batch_no = 'OPENING')
     AND NOT EXISTS (
       SELECT 1 FROM public.batches b2
        WHERE b2.tenant_id = public.batches.tenant_id
          AND b2.product_id = public.batches.product_id
          AND b2.is_opening = true
          AND b2.deleted_at IS NULL
     )
   ORDER BY tenant_id, product_id, created_at ASC, id
)
UPDATE public.batches b
   SET is_opening = true
  FROM candidates c
 WHERE b.id = c.id;

-- FIX #2: robust opening detection in dashboard KPI
CREATE OR REPLACE FUNCTION public.get_inventory_overview(_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE result jsonb;
BEGIN
  WITH prod_stock AS (
    SELECT p.id, p.name, p.sku, p.reorder_level,
           p.strength, p.medicine_type, p.volume, p.pack_size,
           COALESCE(SUM(b.qty_on_hand), 0)::numeric AS stock,
           COALESCE(SUM(b.qty_on_hand * COALESCE(b.purchase_price, 0)), 0)::numeric AS value,
           COUNT(b.id) FILTER (WHERE b.deleted_at IS NULL) AS batch_count,
           BOOL_OR(
             COALESCE(b.is_opening, false)
             OR b.batch_no LIKE 'OPN-%'
             OR b.batch_no = 'OPENING'
           ) AS has_opening
      FROM public.products p
      LEFT JOIN public.batches b
        ON b.product_id = p.id AND b.tenant_id = _tenant_id AND b.deleted_at IS NULL
     WHERE p.tenant_id = _tenant_id AND p.deleted_at IS NULL
     GROUP BY p.id
  ),
  kpi AS (
    SELECT COALESCE(SUM(stock), 0)::numeric AS total_stock,
           COALESCE(SUM(value), 0)::numeric AS total_value,
           COUNT(*) FILTER (WHERE stock > 0 AND reorder_level IS NOT NULL AND stock <= reorder_level) AS low_count,
           COUNT(*) FILTER (WHERE stock <= 0) AS out_count,
           COUNT(*) FILTER (WHERE batch_count = 0) AS no_batch_count,
           COUNT(*) FILTER (WHERE NOT COALESCE(has_opening, false)) AS no_opening_count
      FROM prod_stock
  ),
  expired AS (
    SELECT COUNT(*)::int AS expired_count
      FROM public.batches b
     WHERE b.tenant_id = _tenant_id AND b.deleted_at IS NULL
       AND b.qty_on_hand > 0 AND b.expiry_date IS NOT NULL AND b.expiry_date < CURRENT_DATE
  ),
  low_list AS (
    SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'sku', sku,
      'stock', stock, 'reorder_level', reorder_level,
      'strength', strength, 'medicine_type', medicine_type, 'volume', volume, 'pack_size', pack_size
    )) AS rows
    FROM (SELECT * FROM prod_stock
           WHERE stock > 0 AND reorder_level IS NOT NULL AND stock <= reorder_level
           ORDER BY stock ASC LIMIT 200) x
  ),
  out_list AS (
    SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'sku', sku, 'reorder_level', reorder_level,
      'strength', strength, 'medicine_type', medicine_type, 'volume', volume, 'pack_size', pack_size
    )) AS rows
    FROM (SELECT * FROM prod_stock WHERE stock <= 0
           ORDER BY name ASC LIMIT 200) x
  ),
  expiring_rows AS (
    SELECT p.name AS name, p.strength, p.medicine_type, p.volume, p.pack_size,
           COALESCE(b.batch_no, '-') AS batch,
           (b.expiry_date - CURRENT_DATE) AS days, b.expiry_date
      FROM public.batches b
      JOIN public.products p ON p.id = b.product_id
     WHERE b.tenant_id = _tenant_id AND b.deleted_at IS NULL
       AND b.qty_on_hand > 0 AND b.expiry_date IS NOT NULL
       AND b.expiry_date <= CURRENT_DATE + INTERVAL '90 days'
     ORDER BY b.expiry_date ASC LIMIT 500
  ),
  expiring AS (
    SELECT jsonb_agg(jsonb_build_object(
      'name', name, 'batch', batch, 'days', days,
      'strength', strength, 'medicine_type', medicine_type, 'volume', volume, 'pack_size', pack_size
    )) AS rows
    FROM expiring_rows
  )
  SELECT jsonb_build_object(
    'kpi', jsonb_build_object(
      'totalStock', (SELECT total_stock FROM kpi),
      'totalValue', (SELECT total_value FROM kpi),
      'lowCount', (SELECT low_count FROM kpi),
      'outCount', (SELECT out_count FROM kpi),
      'noBatchCount', (SELECT no_batch_count FROM kpi),
      'noOpeningCount', (SELECT no_opening_count FROM kpi),
      'expiredCount', (SELECT expired_count FROM expired)
    ),
    'lowStock', COALESCE((SELECT rows FROM low_list), '[]'::jsonb),
    'outStock', COALESCE((SELECT rows FROM out_list), '[]'::jsonb),
    'expiring', COALESCE((SELECT rows FROM expiring), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END $function$;

-- FIX #5: search_products — in-stock first, then exact name match, then highest stock
CREATE OR REPLACE FUNCTION public.search_products(_tenant_id uuid, _query text, _branch_id uuid DEFAULT NULL::uuid, _limit integer DEFAULT 20, _warehouse_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, name text, sku text, barcode text, retail_price numeric, purchase_price numeric, vat_rate numeric, qty_on_hand numeric, nearest_expiry date, strength text, medicine_type text, volume text, pack_size integer, generic_name text, category_name text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_q text; v_like text; v_lq text;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  v_q  := COALESCE(trim(_query), '');
  v_lq := lower(v_q);
  v_like := '%' || replace(replace(replace(v_q,'\','\\'),'%','\%'),'_','\_') || '%';

  RETURN QUERY
  WITH base AS (
    SELECT p.id AS product_id, p.name, p.sku, p.barcode, p.retail_price, p.purchase_price, p.vat_rate,
           p.strength, p.medicine_type, p.volume, p.pack_size,
           p.generic_id, p.category_id
      FROM public.products p
     WHERE p.tenant_id = _tenant_id AND p.is_active = true AND p.deleted_at IS NULL
       AND (
         v_q = '' OR
         p.name ILIKE v_like ESCAPE '\' OR p.sku ILIKE v_like ESCAPE '\' OR p.barcode ILIKE v_like ESCAPE '\' OR
         (p.name||' '||COALESCE(p.strength,'')||' '||COALESCE(p.medicine_type,'')||' '||COALESCE(p.volume,'')) ILIKE v_like ESCAPE '\'
       )
     LIMIT 500
  ),
  stock AS (
    SELECT b.product_id, SUM(b.qty_on_hand)::numeric AS qty_on_hand, MIN(b.expiry_date) AS nearest_expiry
      FROM public.batches b
     WHERE b.tenant_id = _tenant_id AND b.qty_on_hand > 0
       AND b.product_id IN (SELECT base.product_id FROM base)
       AND (_warehouse_id IS NULL OR b.warehouse_id = _warehouse_id)
     GROUP BY b.product_id
  )
  SELECT b.product_id AS id, b.name, b.sku, b.barcode, b.retail_price, b.purchase_price, b.vat_rate,
         COALESCE(s.qty_on_hand, 0) AS qty_on_hand, s.nearest_expiry,
         b.strength, b.medicine_type, b.volume, b.pack_size,
         g.name AS generic_name, c.name AS category_name
    FROM base b
    LEFT JOIN stock s ON s.product_id = b.product_id
    LEFT JOIN public.generics g ON g.id = b.generic_id
    LEFT JOIN public.categories c ON c.id = b.category_id
   ORDER BY
     (b.barcode = v_q) DESC,
     (b.sku = v_q) DESC,
     (COALESCE(s.qty_on_hand, 0) > 0) DESC,
     (lower(b.name) = v_lq) DESC,
     COALESCE(s.qty_on_hand, 0) DESC,
     b.name ASC
   LIMIT GREATEST(1, LEAST(COALESCE(_limit,20), 100));
END $function$;