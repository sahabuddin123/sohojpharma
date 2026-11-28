-- Enable filtering by manufacturer (company), generic, category, and scoped/multi-field search
-- across both desktop (/products) and mobile (/m/product-list) product management views.

DROP FUNCTION IF EXISTS public.list_products_for_management(uuid, text, text, integer, integer, text, boolean);
DROP FUNCTION IF EXISTS public.list_products_for_management(uuid, text, text, integer, integer, text, boolean, uuid, uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.list_products_for_management(
  p_tenant_id uuid,
  p_search text DEFAULT NULL,
  p_barcode text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50,
  p_status_filter text DEFAULT NULL,        -- 'in' | 'low' | 'out' | 'neg' | NULL
  p_with_count boolean DEFAULT true,
  p_manufacturer_id uuid DEFAULT NULL,
  p_generic_id uuid DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_search_by text DEFAULT 'all'            -- 'all' | 'name' | 'company' | 'generic' | 'category' | 'barcode'
)
RETURNS TABLE(
  id uuid, name text, sku text, barcode text,
  retail_price numeric, purchase_price numeric,
  is_active boolean, reorder_level integer,
  medicine_type text, strength text, volume text,
  country_of_origin text, status text, qty_per_box numeric,
  branch_id uuid,
  generic_id uuid, generic_name text,
  manufacturer_id uuid, manufacturer_name text,
  category_id uuid, category_name text,
  stock numeric, total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_offset integer := GREATEST(p_page - 1, 0) * GREATEST(p_page_size, 1);
  v_limit  integer := LEAST(GREATEST(p_page_size, 1), 200);
  v_search text := NULLIF(btrim(coalesce(p_search, '')), '');
  v_scope  text := COALESCE(NULLIF(lower(btrim(coalesce(p_search_by, 'all'))), ''), 'all');
  v_escaped text := CASE
    WHEN v_search IS NULL THEN NULL
    ELSE replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_')
  END;
  v_like text := CASE WHEN v_escaped IS NULL THEN NULL ELSE '%' || v_escaped || '%' END;
  v_prefix text := CASE WHEN v_escaped IS NULL THEN NULL ELSE v_escaped || '%' END;
  v_total bigint := NULL;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), p_tenant_id) THEN
    RETURN;
  END IF;

  IF p_status_filter IS NULL THEN
    IF p_with_count THEN
      SELECT count(*) INTO v_total
      FROM public.products pr
      WHERE pr.tenant_id = p_tenant_id
        AND pr.deleted_at IS NULL
        AND (p_barcode IS NULL OR pr.barcode = p_barcode)
        AND (p_manufacturer_id IS NULL OR pr.manufacturer_id = p_manufacturer_id)
        AND (p_generic_id IS NULL OR pr.generic_id = p_generic_id)
        AND (p_category_id IS NULL OR pr.category_id = p_category_id)
        AND (
          v_like IS NULL
          OR (v_scope = 'name' AND pr.name ILIKE v_like ESCAPE '\')
          OR (v_scope = 'barcode' AND (pr.barcode ILIKE v_like ESCAPE '\' OR pr.sku ILIKE v_like ESCAPE '\'))
          OR (v_scope = 'company' AND pr.manufacturer_id IN (
            SELECT m2.id FROM public.manufacturers m2
            WHERE m2.tenant_id = p_tenant_id AND m2.deleted_at IS NULL AND m2.name ILIKE v_like ESCAPE '\'
          ))
          OR (v_scope = 'generic' AND pr.generic_id IN (
            SELECT g2.id FROM public.generics g2
            WHERE g2.tenant_id = p_tenant_id AND g2.deleted_at IS NULL AND g2.name ILIKE v_like ESCAPE '\'
          ))
          OR (v_scope = 'category' AND pr.category_id IN (
            SELECT c2.id FROM public.categories c2
            WHERE c2.tenant_id = p_tenant_id AND c2.deleted_at IS NULL AND c2.name ILIKE v_like ESCAPE '\'
          ))
          OR (v_scope NOT IN ('name', 'barcode', 'company', 'generic', 'category') AND (
            pr.name ILIKE v_like ESCAPE '\'
            OR pr.sku ILIKE v_like ESCAPE '\'
            OR pr.barcode ILIKE v_like ESCAPE '\'
            OR pr.manufacturer_id IN (
              SELECT m2.id FROM public.manufacturers m2
              WHERE m2.tenant_id = p_tenant_id AND m2.deleted_at IS NULL AND m2.name ILIKE v_like ESCAPE '\'
            )
            OR pr.generic_id IN (
              SELECT g2.id FROM public.generics g2
              WHERE g2.tenant_id = p_tenant_id AND g2.deleted_at IS NULL AND g2.name ILIKE v_like ESCAPE '\'
            )
            OR pr.category_id IN (
              SELECT c2.id FROM public.categories c2
              WHERE c2.tenant_id = p_tenant_id AND c2.deleted_at IS NULL AND c2.name ILIKE v_like ESCAPE '\'
            )
          ))
        );
    END IF;

    RETURN QUERY
    WITH page AS (
      SELECT pr.*
      FROM public.products pr
      WHERE pr.tenant_id = p_tenant_id
        AND pr.deleted_at IS NULL
        AND (p_barcode IS NULL OR pr.barcode = p_barcode)
        AND (p_manufacturer_id IS NULL OR pr.manufacturer_id = p_manufacturer_id)
        AND (p_generic_id IS NULL OR pr.generic_id = p_generic_id)
        AND (p_category_id IS NULL OR pr.category_id = p_category_id)
        AND (
          v_like IS NULL
          OR (v_scope = 'name' AND pr.name ILIKE v_like ESCAPE '\')
          OR (v_scope = 'barcode' AND (pr.barcode ILIKE v_like ESCAPE '\' OR pr.sku ILIKE v_like ESCAPE '\'))
          OR (v_scope = 'company' AND pr.manufacturer_id IN (
            SELECT m2.id FROM public.manufacturers m2
            WHERE m2.tenant_id = p_tenant_id AND m2.deleted_at IS NULL AND m2.name ILIKE v_like ESCAPE '\'
          ))
          OR (v_scope = 'generic' AND pr.generic_id IN (
            SELECT g2.id FROM public.generics g2
            WHERE g2.tenant_id = p_tenant_id AND g2.deleted_at IS NULL AND g2.name ILIKE v_like ESCAPE '\'
          ))
          OR (v_scope = 'category' AND pr.category_id IN (
            SELECT c2.id FROM public.categories c2
            WHERE c2.tenant_id = p_tenant_id AND c2.deleted_at IS NULL AND c2.name ILIKE v_like ESCAPE '\'
          ))
          OR (v_scope NOT IN ('name', 'barcode', 'company', 'generic', 'category') AND (
            pr.name ILIKE v_like ESCAPE '\'
            OR pr.sku ILIKE v_like ESCAPE '\'
            OR pr.barcode ILIKE v_like ESCAPE '\'
            OR pr.manufacturer_id IN (
              SELECT m2.id FROM public.manufacturers m2
              WHERE m2.tenant_id = p_tenant_id AND m2.deleted_at IS NULL AND m2.name ILIKE v_like ESCAPE '\'
            )
            OR pr.generic_id IN (
              SELECT g2.id FROM public.generics g2
              WHERE g2.tenant_id = p_tenant_id AND g2.deleted_at IS NULL AND g2.name ILIKE v_like ESCAPE '\'
            )
            OR pr.category_id IN (
              SELECT c2.id FROM public.categories c2
              WHERE c2.tenant_id = p_tenant_id AND c2.deleted_at IS NULL AND c2.name ILIKE v_like ESCAPE '\'
            )
          ))
        )
      ORDER BY
        CASE
          WHEN v_search IS NULL THEN 0
          WHEN lower(pr.name) = lower(v_search) THEN 0
          WHEN pr.name ILIKE v_prefix ESCAPE '\' THEN 1
          ELSE 2
        END,
        pr.name
      OFFSET v_offset
      LIMIT v_limit
    )
    SELECT
      pr.id, pr.name, pr.sku, pr.barcode, pr.retail_price, pr.purchase_price,
      pr.is_active, pr.reorder_level, pr.medicine_type, pr.strength, pr.volume,
      pr.country_of_origin, pr.status, pr.qty_per_box::numeric, pr.branch_id,
      pr.generic_id, g.name AS generic_name,
      pr.manufacturer_id, m.name AS manufacturer_name,
      pr.category_id, c.name AS category_name,
      COALESCE(s.stock, 0)::numeric AS stock,
      v_total AS total_count
    FROM page pr
    LEFT JOIN public.generics g
      ON g.id = pr.generic_id AND g.tenant_id = pr.tenant_id AND g.deleted_at IS NULL
    LEFT JOIN public.manufacturers m
      ON m.id = pr.manufacturer_id AND m.tenant_id = pr.tenant_id AND m.deleted_at IS NULL
    LEFT JOIN public.categories c
      ON c.id = pr.category_id AND c.tenant_id = pr.tenant_id AND c.deleted_at IS NULL
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(b.qty_on_hand), 0) AS stock
      FROM public.batches b
      WHERE b.product_id = pr.id
        AND b.tenant_id = pr.tenant_id
        AND b.deleted_at IS NULL
    ) s ON true
    ORDER BY
      CASE
        WHEN v_search IS NULL THEN 0
        WHEN lower(pr.name) = lower(v_search) THEN 0
        WHEN pr.name ILIKE v_prefix ESCAPE '\' THEN 1
        ELSE 2
      END,
      pr.name;
    RETURN;
  END IF;

  -- Stock-filtered path: aggregate active batches per product once so status tabs remain accurate.
  IF p_with_count THEN
    WITH stock_by_prod AS (
      SELECT b.product_id, COALESCE(SUM(b.qty_on_hand), 0)::numeric AS stock
      FROM public.batches b
      WHERE b.tenant_id = p_tenant_id AND b.deleted_at IS NULL
      GROUP BY b.product_id
    )
    SELECT count(*) INTO v_total
    FROM public.products pr
    LEFT JOIN stock_by_prod sb ON sb.product_id = pr.id
    WHERE pr.tenant_id = p_tenant_id
      AND pr.deleted_at IS NULL
      AND (p_barcode IS NULL OR pr.barcode = p_barcode)
      AND (p_manufacturer_id IS NULL OR pr.manufacturer_id = p_manufacturer_id)
      AND (p_generic_id IS NULL OR pr.generic_id = p_generic_id)
      AND (p_category_id IS NULL OR pr.category_id = p_category_id)
      AND (
        v_like IS NULL
        OR (v_scope = 'name' AND pr.name ILIKE v_like ESCAPE '\')
        OR (v_scope = 'barcode' AND (pr.barcode ILIKE v_like ESCAPE '\' OR pr.sku ILIKE v_like ESCAPE '\'))
        OR (v_scope = 'company' AND pr.manufacturer_id IN (
          SELECT m2.id FROM public.manufacturers m2
          WHERE m2.tenant_id = p_tenant_id AND m2.deleted_at IS NULL AND m2.name ILIKE v_like ESCAPE '\'
        ))
        OR (v_scope = 'generic' AND pr.generic_id IN (
          SELECT g2.id FROM public.generics g2
          WHERE g2.tenant_id = p_tenant_id AND g2.deleted_at IS NULL AND g2.name ILIKE v_like ESCAPE '\'
        ))
        OR (v_scope = 'category' AND pr.category_id IN (
          SELECT c2.id FROM public.categories c2
          WHERE c2.tenant_id = p_tenant_id AND c2.deleted_at IS NULL AND c2.name ILIKE v_like ESCAPE '\'
        ))
        OR (v_scope NOT IN ('name', 'barcode', 'company', 'generic', 'category') AND (
          pr.name ILIKE v_like ESCAPE '\'
          OR pr.sku ILIKE v_like ESCAPE '\'
          OR pr.barcode ILIKE v_like ESCAPE '\'
          OR pr.manufacturer_id IN (
            SELECT m2.id FROM public.manufacturers m2
            WHERE m2.tenant_id = p_tenant_id AND m2.deleted_at IS NULL AND m2.name ILIKE v_like ESCAPE '\'
          )
          OR pr.generic_id IN (
            SELECT g2.id FROM public.generics g2
            WHERE g2.tenant_id = p_tenant_id AND g2.deleted_at IS NULL AND g2.name ILIKE v_like ESCAPE '\'
          )
          OR pr.category_id IN (
            SELECT c2.id FROM public.categories c2
            WHERE c2.tenant_id = p_tenant_id AND c2.deleted_at IS NULL AND c2.name ILIKE v_like ESCAPE '\'
          )
        ))
      )
      AND (
        (p_status_filter = 'neg' AND COALESCE(sb.stock, 0) < 0)
        OR (p_status_filter = 'out' AND COALESCE(sb.stock, 0) = 0)
        OR (p_status_filter = 'low' AND COALESCE(sb.stock, 0) > 0 AND pr.reorder_level IS NOT NULL AND COALESCE(sb.stock, 0) <= pr.reorder_level)
        OR (p_status_filter = 'in' AND COALESCE(sb.stock, 0) > 0 AND (pr.reorder_level IS NULL OR COALESCE(sb.stock, 0) > pr.reorder_level))
      );
  END IF;

  RETURN QUERY
  WITH stock_by_prod AS (
    SELECT b.product_id, COALESCE(SUM(b.qty_on_hand), 0)::numeric AS stock
    FROM public.batches b
    WHERE b.tenant_id = p_tenant_id AND b.deleted_at IS NULL
    GROUP BY b.product_id
  ),
  filtered AS (
    SELECT pr.*, COALESCE(sb.stock, 0)::numeric AS calc_stock
    FROM public.products pr
    LEFT JOIN stock_by_prod sb ON sb.product_id = pr.id
    WHERE pr.tenant_id = p_tenant_id
      AND pr.deleted_at IS NULL
      AND (p_barcode IS NULL OR pr.barcode = p_barcode)
      AND (p_manufacturer_id IS NULL OR pr.manufacturer_id = p_manufacturer_id)
      AND (p_generic_id IS NULL OR pr.generic_id = p_generic_id)
      AND (p_category_id IS NULL OR pr.category_id = p_category_id)
      AND (
        v_like IS NULL
        OR (v_scope = 'name' AND pr.name ILIKE v_like ESCAPE '\')
        OR (v_scope = 'barcode' AND (pr.barcode ILIKE v_like ESCAPE '\' OR pr.sku ILIKE v_like ESCAPE '\'))
        OR (v_scope = 'company' AND pr.manufacturer_id IN (
          SELECT m2.id FROM public.manufacturers m2
          WHERE m2.tenant_id = p_tenant_id AND m2.deleted_at IS NULL AND m2.name ILIKE v_like ESCAPE '\'
        ))
        OR (v_scope = 'generic' AND pr.generic_id IN (
          SELECT g2.id FROM public.generics g2
          WHERE g2.tenant_id = p_tenant_id AND g2.deleted_at IS NULL AND g2.name ILIKE v_like ESCAPE '\'
        ))
        OR (v_scope = 'category' AND pr.category_id IN (
          SELECT c2.id FROM public.categories c2
          WHERE c2.tenant_id = p_tenant_id AND c2.deleted_at IS NULL AND c2.name ILIKE v_like ESCAPE '\'
        ))
        OR (v_scope NOT IN ('name', 'barcode', 'company', 'generic', 'category') AND (
          pr.name ILIKE v_like ESCAPE '\'
          OR pr.sku ILIKE v_like ESCAPE '\'
          OR pr.barcode ILIKE v_like ESCAPE '\'
          OR pr.manufacturer_id IN (
            SELECT m2.id FROM public.manufacturers m2
            WHERE m2.tenant_id = p_tenant_id AND m2.deleted_at IS NULL AND m2.name ILIKE v_like ESCAPE '\'
          )
          OR pr.generic_id IN (
            SELECT g2.id FROM public.generics g2
            WHERE g2.tenant_id = p_tenant_id AND g2.deleted_at IS NULL AND g2.name ILIKE v_like ESCAPE '\'
          )
          OR pr.category_id IN (
            SELECT c2.id FROM public.categories c2
            WHERE c2.tenant_id = p_tenant_id AND c2.deleted_at IS NULL AND c2.name ILIKE v_like ESCAPE '\'
          )
        ))
      )
      AND (
        (p_status_filter = 'neg' AND COALESCE(sb.stock, 0) < 0)
        OR (p_status_filter = 'out' AND COALESCE(sb.stock, 0) = 0)
        OR (p_status_filter = 'low' AND COALESCE(sb.stock, 0) > 0 AND pr.reorder_level IS NOT NULL AND COALESCE(sb.stock, 0) <= pr.reorder_level)
        OR (p_status_filter = 'in' AND COALESCE(sb.stock, 0) > 0 AND (pr.reorder_level IS NULL OR COALESCE(sb.stock, 0) > pr.reorder_level))
      )
    ORDER BY
      CASE
        WHEN v_search IS NULL THEN 0
        WHEN lower(pr.name) = lower(v_search) THEN 0
        WHEN pr.name ILIKE v_prefix ESCAPE '\' THEN 1
        ELSE 2
      END,
      pr.name
    OFFSET v_offset
    LIMIT v_limit
  )
  SELECT
    f.id, f.name, f.sku, f.barcode, f.retail_price, f.purchase_price,
    f.is_active, f.reorder_level, f.medicine_type, f.strength, f.volume,
    f.country_of_origin, f.status, f.qty_per_box::numeric, f.branch_id,
    f.generic_id, g.name AS generic_name,
    f.manufacturer_id, m.name AS manufacturer_name,
    f.category_id, c.name AS category_name,
    f.calc_stock AS stock,
    v_total AS total_count
  FROM filtered f
  LEFT JOIN public.generics g
    ON g.id = f.generic_id AND g.tenant_id = f.tenant_id AND g.deleted_at IS NULL
  LEFT JOIN public.manufacturers m
    ON m.id = f.manufacturer_id AND m.tenant_id = f.tenant_id AND m.deleted_at IS NULL
  LEFT JOIN public.categories c
    ON c.id = f.category_id AND c.tenant_id = f.tenant_id AND c.deleted_at IS NULL
  ORDER BY
    CASE
      WHEN v_search IS NULL THEN 0
      WHEN lower(f.name) = lower(v_search) THEN 0
      WHEN f.name ILIKE v_prefix ESCAPE '\' THEN 1
      ELSE 2
    END,
    f.name;
END;
$fn$;

REVOKE ALL ON FUNCTION public.list_products_for_management(uuid, text, text, integer, integer, text, boolean, uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_products_for_management(uuid, text, text, integer, integer, text, boolean, uuid, uuid, uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_product_filter_options(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), p_tenant_id) THEN
    RETURN jsonb_build_object('manufacturers', '[]'::jsonb, 'generics', '[]'::jsonb, 'categories', '[]'::jsonb);
  END IF;

  RETURN jsonb_build_object(
    'manufacturers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name) ORDER BY lower(m.name), m.name)
      FROM public.manufacturers m
      WHERE m.tenant_id = p_tenant_id AND m.deleted_at IS NULL
    ), '[]'::jsonb),
    'generics', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name) ORDER BY lower(g.name), g.name)
      FROM public.generics g
      WHERE g.tenant_id = p_tenant_id AND g.deleted_at IS NULL
    ), '[]'::jsonb),
    'categories', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) ORDER BY lower(c.name), c.name)
      FROM public.categories c
      WHERE c.tenant_id = p_tenant_id AND c.deleted_at IS NULL
    ), '[]'::jsonb)
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_product_filter_options(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_product_filter_options(uuid) TO authenticated, service_role;
