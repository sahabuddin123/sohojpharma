CREATE OR REPLACE FUNCTION public.search_products(
  _tenant_id uuid, _query text, _branch_id uuid DEFAULT NULL::uuid,
  _limit integer DEFAULT 20, _warehouse_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  id uuid, name text, sku text, barcode text,
  retail_price numeric, purchase_price numeric, vat_rate numeric,
  qty_on_hand numeric, nearest_expiry date,
  strength text, medicine_type text, volume text, pack_size integer,
  generic_name text, category_name text,
  effective_price numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_q text; v_like text; v_lq text;
BEGIN
  IF NOT (
    public.is_tenant_member(auth.uid(), _tenant_id)
    OR public.is_app_admin(auth.uid())
  ) THEN
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
  ),
  latest_mrp AS (
    SELECT DISTINCT ON (b.product_id)
           b.product_id, b.mrp
      FROM public.batches b
     WHERE b.tenant_id = _tenant_id
       AND b.product_id IN (SELECT base.product_id FROM base)
       AND b.mrp IS NOT NULL AND b.mrp > 0
       AND (_warehouse_id IS NULL OR b.warehouse_id = _warehouse_id)
     ORDER BY b.product_id, b.created_at DESC
  )
  SELECT b.product_id AS id, b.name, b.sku, b.barcode, b.retail_price, b.purchase_price, b.vat_rate,
         COALESCE(s.qty_on_hand, 0) AS qty_on_hand, s.nearest_expiry,
         b.strength, b.medicine_type, b.volume, b.pack_size,
         g.name AS generic_name, c.name AS category_name,
         COALESCE(lm.mrp, NULLIF(b.retail_price,0), 0)::numeric AS effective_price
    FROM base b
    LEFT JOIN stock s ON s.product_id = b.product_id
    LEFT JOIN latest_mrp lm ON lm.product_id = b.product_id
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

GRANT EXECUTE ON FUNCTION public.search_products(uuid,text,uuid,integer,uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.search_products(uuid,text,uuid,integer,uuid) FROM anon, public;