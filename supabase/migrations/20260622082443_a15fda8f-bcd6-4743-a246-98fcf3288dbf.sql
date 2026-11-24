
-- 1. Browse global catalog
CREATE OR REPLACE FUNCTION public.browse_global_catalog(
  _tenant uuid,
  _q text DEFAULT '',
  _generic_id uuid DEFAULT NULL,
  _manufacturer_id uuid DEFAULT NULL,
  _dosage_form text DEFAULT NULL,
  _therapeutic_class_id uuid DEFAULT NULL,
  _prescription_only boolean DEFAULT NULL,
  _otc_only boolean DEFAULT NULL,
  _limit int DEFAULT 50,
  _offset int DEFAULT 0
)
RETURNS TABLE(
  id uuid, brand_name text, generic_name text, manufacturer_name text,
  strength text, dosage_form text, prescription_required boolean, otc_allowed boolean,
  already_in_catalog boolean, total_count bigint
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH base AS (
    SELECT gm.id, gm.brand_name, gg.name AS generic_name, gmf.name AS manufacturer_name,
           gm.strength, gm.dosage_form, gm.prescription_required, gm.otc_allowed
    FROM global_medicines gm
    LEFT JOIN global_generics gg ON gg.id = gm.generic_id
    LEFT JOIN global_manufacturers gmf ON gmf.id = gm.manufacturer_id
    WHERE gm.approved = true
      AND (_q = '' OR gm.brand_name ILIKE '%' || _q || '%' OR gg.name ILIKE '%' || _q || '%')
      AND (_generic_id IS NULL OR gm.generic_id = _generic_id)
      AND (_manufacturer_id IS NULL OR gm.manufacturer_id = _manufacturer_id)
      AND (_dosage_form IS NULL OR gm.dosage_form = _dosage_form)
      AND (_prescription_only IS NULL OR gm.prescription_required = _prescription_only)
      AND (_otc_only IS NULL OR gm.otc_allowed = _otc_only)
      AND (_therapeutic_class_id IS NULL OR EXISTS (
        SELECT 1 FROM global_medicine_therapeutic_classes c
        WHERE c.medicine_id = gm.id AND c.therapeutic_class_id = _therapeutic_class_id
      ))
  ), counted AS (SELECT *, COUNT(*) OVER() AS total_count FROM base)
  SELECT c.id, c.brand_name, c.generic_name, c.manufacturer_name, c.strength, c.dosage_form,
         c.prescription_required, c.otc_allowed,
         EXISTS (SELECT 1 FROM products p WHERE p.tenant_id = _tenant AND p.global_medicine_id = c.id AND p.deleted_at IS NULL),
         c.total_count
  FROM counted c ORDER BY c.brand_name LIMIT _limit OFFSET _offset;
$$;
GRANT EXECUTE ON FUNCTION public.browse_global_catalog(uuid, text, uuid, uuid, text, uuid, boolean, boolean, int, int) TO authenticated;

-- 2. Bulk adopt
CREATE OR REPLACE FUNCTION public.bulk_adopt_global(_tenant uuid, _ids uuid[])
RETURNS TABLE(created_count int, skipped_count int, created_product_ids uuid[])
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
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
    IF EXISTS (SELECT 1 FROM products WHERE tenant_id = _tenant AND global_medicine_id = v_gm.id AND deleted_at IS NULL) THEN
      v_skipped := v_skipped + 1; CONTINUE;
    END IF;
    v_sku := 'GM-' || (floor(random() * 9000000)::int + 1000000)::text;
    v_new_id := gen_random_uuid();
    INSERT INTO products (id, tenant_id, sku, name, strength, medicine_type,
      is_prescription_required, global_medicine_id,
      unit, base_unit, purchase_unit, sale_unit, created_by)
    VALUES (v_new_id, _tenant, v_sku, v_gm.brand_name, v_gm.strength, v_gm.dosage_form,
      v_gm.prescription_required, v_gm.id, 'pcs','pcs','pcs','pcs', auth.uid());
    v_created := v_created + 1; v_ids := v_ids || v_new_id;
  END LOOP;
  RETURN QUERY SELECT v_created, v_skipped, v_ids;
END $$;
GRANT EXECUTE ON FUNCTION public.bulk_adopt_global(uuid, uuid[]) TO authenticated;

-- 3. Bulk link
CREATE OR REPLACE FUNCTION public.bulk_link_local_products(_tenant uuid, _limit int DEFAULT 1000)
RETURNS TABLE(matched_count int, unmatched_count int, scanned_count int)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_matched int := 0; v_unmatched int := 0; v_scanned int := 0; v_p RECORD; v_match uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tenant_members WHERE tenant_id = _tenant AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  FOR v_p IN
    SELECT p.id, p.name AS brand,
           COALESCE((SELECT name FROM product_generics g WHERE g.id = p.product_generic_id), '') AS generic,
           COALESCE((SELECT name FROM product_companies c WHERE c.id = p.product_company_id), '') AS mfr,
           COALESCE(p.strength, '') AS strength, COALESCE(p.medicine_type, '') AS form
    FROM products p
    WHERE p.tenant_id = _tenant AND p.global_medicine_id IS NULL AND p.deleted_at IS NULL
    LIMIT _limit
  LOOP
    v_scanned := v_scanned + 1;
    SELECT public.match_global_medicine(v_p.brand, v_p.generic, v_p.mfr, v_p.strength, v_p.form) INTO v_match;
    IF v_match IS NOT NULL THEN
      UPDATE products SET global_medicine_id = v_match WHERE id = v_p.id;
      v_matched := v_matched + 1;
    ELSE v_unmatched := v_unmatched + 1; END IF;
  END LOOP;
  RETURN QUERY SELECT v_matched, v_unmatched, v_scanned;
END $$;
GRANT EXECUTE ON FUNCTION public.bulk_link_local_products(uuid, int) TO authenticated;

-- 4. Barcode lookup
CREATE OR REPLACE FUNCTION public.barcode_lookup_global(_barcode text)
RETURNS TABLE(global_medicine_id uuid, brand_name text, generic_name text,
  manufacturer_name text, strength text, dosage_form text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT gm.id, gm.brand_name, gg.name, gmf.name, gm.strength, gm.dosage_form
  FROM global_barcodes gb JOIN global_medicines gm ON gm.id = gb.global_medicine_id
  LEFT JOIN global_generics gg ON gg.id = gm.generic_id
  LEFT JOIN global_manufacturers gmf ON gmf.id = gm.manufacturer_id
  WHERE gb.barcode = _barcode LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.barcode_lookup_global(text) TO authenticated;

-- 5. Tenant catalog health
CREATE OR REPLACE FUNCTION public.tenant_catalog_health(_tenant uuid)
RETURNS TABLE(total int, linked int, unlinked int, coverage_pct numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH s AS (
    SELECT COUNT(*) FILTER (WHERE deleted_at IS NULL)::int AS total,
           COUNT(*) FILTER (WHERE deleted_at IS NULL AND global_medicine_id IS NOT NULL)::int AS linked
    FROM products WHERE tenant_id = _tenant
  )
  SELECT total, linked, total - linked,
    CASE WHEN total = 0 THEN 0 ELSE ROUND((linked::numeric / total) * 100, 2) END FROM s;
$$;
GRANT EXECUTE ON FUNCTION public.tenant_catalog_health(uuid) TO authenticated;

-- 6. Admin adoption analytics
CREATE OR REPLACE FUNCTION public.admin_adoption_analytics()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.is_app_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_build_object(
    'total_global_medicines', (SELECT COUNT(*) FROM global_medicines WHERE approved = true),
    'total_linked_products',  (SELECT COUNT(*) FROM products WHERE global_medicine_id IS NOT NULL AND deleted_at IS NULL),
    'total_products', (SELECT COUNT(*) FROM products WHERE deleted_at IS NULL),
    'total_pending_contributions', (SELECT COUNT(*) FROM global_medicine_contributions WHERE status = 'pending'),
    'adoption_pct', (SELECT CASE WHEN COUNT(*) = 0 THEN 0
        ELSE ROUND((COUNT(*) FILTER (WHERE global_medicine_id IS NOT NULL))::numeric / COUNT(*) * 100, 2) END
      FROM products WHERE deleted_at IS NULL),
    'most_added_medicines', (SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
      SELECT gm.id, gm.brand_name, COUNT(*) AS adoption_count
      FROM products p JOIN global_medicines gm ON gm.id = p.global_medicine_id
      WHERE p.deleted_at IS NULL GROUP BY gm.id, gm.brand_name
      ORDER BY adoption_count DESC LIMIT 10) t),
    'most_linked_stores', (SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
      SELECT tn.id, tn.name, COUNT(*) AS linked_count
      FROM products p JOIN tenants tn ON tn.id = p.tenant_id
      WHERE p.global_medicine_id IS NOT NULL AND p.deleted_at IS NULL
      GROUP BY tn.id, tn.name ORDER BY linked_count DESC LIMIT 10) t)
  ) INTO v; RETURN v;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_adoption_analytics() TO authenticated;

-- 7. Admin-only writes on global tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'global_medicines','global_generics','global_manufacturers','global_barcodes',
    'global_medicine_aliases','global_packs'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_write', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_app_admin(auth.uid())) WITH CHECK (public.is_app_admin(auth.uid()))',
      t || '_admin_write', t);
  END LOOP;
END $$;
