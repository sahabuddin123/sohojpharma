
CREATE INDEX IF NOT EXISTS idx_products_tenant_global
  ON public.products(tenant_id, global_medicine_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_global_barcodes_gm
  ON public.global_barcodes(global_medicine_id);

-- bulk_adopt_global: also copy barcodes + seed default settings
CREATE OR REPLACE FUNCTION public.bulk_adopt_global(_tenant uuid, _ids uuid[])
RETURNS TABLE(created_count integer, skipped_count integer, created_product_ids uuid[])
LANGUAGE plpgsql SET search_path TO 'public'
AS $$
DECLARE v_created int := 0; v_skipped int := 0; v_ids uuid[] := ARRAY[]::uuid[];
        v_gm RECORD; v_new_id uuid; v_sku text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tenant_members WHERE tenant_id = _tenant AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  FOR v_gm IN
    SELECT gm.id, gm.brand_name, gm.strength, gm.dosage_form, gm.prescription_required
    FROM global_medicines gm WHERE gm.id = ANY(_ids) AND gm.approved = true
  LOOP
    IF EXISTS (SELECT 1 FROM products
               WHERE tenant_id = _tenant AND global_medicine_id = v_gm.id AND deleted_at IS NULL) THEN
      v_skipped := v_skipped + 1; CONTINUE;
    END IF;
    v_sku := 'GM-' || (floor(random() * 9000000)::int + 1000000)::text;
    v_new_id := gen_random_uuid();
    INSERT INTO products (id, tenant_id, sku, name, strength, medicine_type,
      is_prescription_required, global_medicine_id,
      unit, base_unit, purchase_unit, sale_unit,
      reorder_level, vat_rate, created_by)
    VALUES (v_new_id, _tenant, v_sku, v_gm.brand_name, v_gm.strength, v_gm.dosage_form,
      v_gm.prescription_required, v_gm.id,
      'pcs','pcs','pcs','pcs',
      10, 0, auth.uid());

    -- Copy barcodes from global → tenant, skipping duplicates
    INSERT INTO product_barcodes (tenant_id, product_id, barcode, barcode_type, is_primary, created_by)
    SELECT _tenant, v_new_id, gb.barcode, 'Code128', false, auth.uid()
    FROM global_barcodes gb
    WHERE gb.global_medicine_id = v_gm.id
    ON CONFLICT (tenant_id, barcode) WHERE deleted_at IS NULL DO NOTHING;

    INSERT INTO global_medicine_adoptions(tenant_id, global_medicine_id, product_id, adopted_by, source)
      VALUES (_tenant, v_gm.id, v_new_id, auth.uid(), 'bulk_adopt')
      ON CONFLICT (tenant_id, global_medicine_id) DO NOTHING;
    v_created := v_created + 1; v_ids := v_ids || v_new_id;
  END LOOP;
  RETURN QUERY SELECT v_created, v_skipped, v_ids;
END $$;

-- unified_medicine_search: add already_in_stock
DROP FUNCTION IF EXISTS public.unified_medicine_search(uuid, text, int);
CREATE FUNCTION public.unified_medicine_search(_tenant uuid, _q text, _limit int DEFAULT 25)
RETURNS TABLE(
  result_type text,
  product_id uuid,
  global_medicine_id uuid,
  brand_name text,
  generic_name text,
  manufacturer_name text,
  strength text,
  dosage_form text,
  prescription_required boolean,
  already_in_stock boolean,
  score real
)
LANGUAGE sql STABLE SET search_path = public, extensions
AS $$
  WITH local AS (
    SELECT 'in_catalog'::text AS result_type,
           p.id AS product_id,
           p.global_medicine_id,
           p.name AS brand_name,
           gm.generic_name_cached AS generic_name,
           gm.manufacturer_name_cached AS manufacturer_name,
           p.strength,
           p.medicine_type AS dosage_form,
           coalesce(p.is_prescription_required,false) AS prescription_required,
           EXISTS (
             SELECT 1 FROM product_batches pb
             WHERE pb.product_id = p.id AND pb.tenant_id = _tenant AND coalesce(pb.qty_on_hand,0) > 0
           ) AS already_in_stock,
           1.0::real AS score
    FROM products p
    LEFT JOIN global_medicines gm ON gm.id = p.global_medicine_id
    WHERE p.tenant_id = _tenant
      AND p.deleted_at IS NULL
      AND (p.name ILIKE _q || '%' OR p.sku ILIKE _q || '%')
    LIMIT _limit
  ),
  globl AS (
    SELECT 'available_globally'::text AS result_type,
           NULL::uuid AS product_id,
           gm.id AS global_medicine_id,
           gm.brand_name,
           gm.generic_name_cached AS generic_name,
           gm.manufacturer_name_cached AS manufacturer_name,
           gm.strength,
           gm.dosage_form,
           gm.prescription_required,
           false AS already_in_stock,
           greatest(similarity(gm.brand_name, _q),
                    similarity(coalesce(gm.generic_name_cached,''), _q))::real AS score
    FROM global_medicines gm
    WHERE gm.approved = true
      AND NOT EXISTS (
        SELECT 1 FROM products p2
        WHERE p2.tenant_id = _tenant AND p2.global_medicine_id = gm.id AND p2.deleted_at IS NULL
      )
      AND (gm.brand_name % _q OR coalesce(gm.generic_name_cached,'') % _q)
    ORDER BY score DESC
    LIMIT _limit
  )
  SELECT * FROM local
  UNION ALL
  SELECT * FROM globl
  ORDER BY result_type ASC, score DESC
  LIMIT _limit * 2;
$$;

GRANT EXECUTE ON FUNCTION public.unified_medicine_search(uuid, text, int) TO authenticated;
