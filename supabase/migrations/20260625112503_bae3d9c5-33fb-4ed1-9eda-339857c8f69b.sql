CREATE OR REPLACE FUNCTION public.list_products_for_management(
  p_tenant_id uuid,
  p_search text DEFAULT NULL,
  p_barcode text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  name text,
  sku text,
  barcode text,
  retail_price numeric,
  purchase_price numeric,
  is_active boolean,
  reorder_level integer,
  medicine_type text,
  strength text,
  volume text,
  country_of_origin text,
  status text,
  qty_per_box numeric,
  branch_id uuid,
  generic_name text,
  manufacturer_name text,
  stock numeric,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH scoped AS (
    SELECT
      pr.id,
      pr.name,
      pr.sku,
      pr.barcode,
      pr.retail_price,
      pr.purchase_price,
      pr.is_active,
      pr.reorder_level,
      pr.medicine_type,
      pr.strength,
      pr.volume,
      pr.country_of_origin,
      pr.status,
      pr.qty_per_box,
      pr.branch_id,
      g.name AS generic_name,
      m.name AS manufacturer_name,
      COALESCE(SUM(b.qty_on_hand) FILTER (WHERE b.deleted_at IS NULL), 0)::numeric AS stock
    FROM public.products pr
    LEFT JOIN public.generics g
      ON g.id = pr.generic_id
     AND g.tenant_id = pr.tenant_id
     AND g.deleted_at IS NULL
    LEFT JOIN public.manufacturers m
      ON m.id = pr.manufacturer_id
     AND m.tenant_id = pr.tenant_id
     AND m.deleted_at IS NULL
    LEFT JOIN public.batches b
      ON b.product_id = pr.id
     AND b.tenant_id = pr.tenant_id
     AND b.deleted_at IS NULL
    WHERE pr.tenant_id = p_tenant_id
      AND pr.deleted_at IS NULL
      AND public.is_tenant_member(auth.uid(), pr.tenant_id)
      AND (p_barcode IS NULL OR pr.barcode = p_barcode)
      AND (
        p_search IS NULL
        OR p_search = ''
        OR pr.name ILIKE '%' || p_search || '%'
        OR pr.sku ILIKE '%' || p_search || '%'
        OR pr.barcode ILIKE '%' || p_search || '%'
      )
    GROUP BY pr.id, g.name, m.name
  ), counted AS (
    SELECT scoped.*, COUNT(*) OVER() AS total_count
    FROM scoped
  )
  SELECT *
  FROM counted
  ORDER BY name
  OFFSET GREATEST(p_page - 1, 0) * GREATEST(p_page_size, 1)
  LIMIT GREATEST(p_page_size, 1);
$$;

REVOKE ALL ON FUNCTION public.list_products_for_management(uuid,text,text,integer,integer) FROM public;
REVOKE ALL ON FUNCTION public.list_products_for_management(uuid,text,text,integer,integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_products_for_management(uuid,text,text,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_products_for_management(uuid,text,text,integer,integer) TO service_role;