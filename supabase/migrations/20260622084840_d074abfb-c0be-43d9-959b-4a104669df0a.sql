
-- 1) Adoption tracking table
CREATE TABLE IF NOT EXISTS public.global_medicine_adoptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  global_medicine_id uuid NOT NULL REFERENCES public.global_medicines(id) ON DELETE CASCADE,
  product_id uuid,
  adopted_by uuid,
  adopted_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'manual',
  UNIQUE(tenant_id, global_medicine_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.global_medicine_adoptions TO authenticated;
GRANT ALL ON public.global_medicine_adoptions TO service_role;

ALTER TABLE public.global_medicine_adoptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read adoptions"
  ON public.global_medicine_adoptions FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.tenant_members tm
            WHERE tm.tenant_id = global_medicine_adoptions.tenant_id
              AND tm.user_id = auth.uid())
    OR public.is_app_admin(auth.uid())
  );

CREATE POLICY "tenant members write adoptions"
  ON public.global_medicine_adoptions FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.tenant_members tm
            WHERE tm.tenant_id = global_medicine_adoptions.tenant_id
              AND tm.user_id = auth.uid())
  );

CREATE POLICY "tenant members delete adoptions"
  ON public.global_medicine_adoptions FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.tenant_members tm
            WHERE tm.tenant_id = global_medicine_adoptions.tenant_id
              AND tm.user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_gma_tenant ON public.global_medicine_adoptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_gma_global ON public.global_medicine_adoptions(global_medicine_id);

-- 2) Updated bulk_adopt_global — also logs adoptions
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
    INSERT INTO global_medicine_adoptions(tenant_id, global_medicine_id, product_id, adopted_by, source)
      VALUES (_tenant, v_gm.id, v_new_id, auth.uid(), 'bulk_adopt')
      ON CONFLICT (tenant_id, global_medicine_id) DO NOTHING;
    v_created := v_created + 1; v_ids := v_ids || v_new_id;
  END LOOP;
  RETURN QUERY SELECT v_created, v_skipped, v_ids;
END $$;

-- 3) Unified search: tenant catalog + global catalog with badge type
CREATE OR REPLACE FUNCTION public.unified_medicine_search(_tenant uuid, _q text, _limit int DEFAULT 25)
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

-- 4) Adoption suggestions: most-adopted globally, not yet in tenant catalog
CREATE OR REPLACE FUNCTION public.adoption_suggestions(_tenant uuid, _limit int DEFAULT 10)
RETURNS TABLE(
  global_medicine_id uuid,
  brand_name text,
  generic_name text,
  manufacturer_name text,
  strength text,
  dosage_form text,
  adoption_count bigint
)
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT gm.id,
         gm.brand_name,
         gm.generic_name_cached,
         gm.manufacturer_name_cached,
         gm.strength,
         gm.dosage_form,
         count(a.id) AS adoption_count
  FROM global_medicines gm
  LEFT JOIN global_medicine_adoptions a ON a.global_medicine_id = gm.id
  WHERE gm.approved = true
    AND NOT EXISTS (
      SELECT 1 FROM products p
      WHERE p.tenant_id = _tenant AND p.global_medicine_id = gm.id AND p.deleted_at IS NULL
    )
  GROUP BY gm.id
  ORDER BY adoption_count DESC NULLS LAST, gm.brand_name ASC
  LIMIT _limit;
$$;

GRANT EXECUTE ON FUNCTION public.adoption_suggestions(uuid, int) TO authenticated;

-- 5) Admin breakdown
CREATE OR REPLACE FUNCTION public.top_adopted_breakdown(_limit int DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.is_app_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_build_object(
    'medicines', (
      SELECT coalesce(jsonb_agg(t), '[]'::jsonb) FROM (
        SELECT gm.id, gm.brand_name, count(a.id) AS adoptions
        FROM global_medicine_adoptions a
        JOIN global_medicines gm ON gm.id = a.global_medicine_id
        GROUP BY gm.id ORDER BY count(a.id) DESC LIMIT _limit
      ) t
    ),
    'generics', (
      SELECT coalesce(jsonb_agg(t), '[]'::jsonb) FROM (
        SELECT gm.generic_name_cached AS generic_name, count(a.id) AS adoptions
        FROM global_medicine_adoptions a
        JOIN global_medicines gm ON gm.id = a.global_medicine_id
        WHERE gm.generic_name_cached IS NOT NULL
        GROUP BY gm.generic_name_cached ORDER BY count(a.id) DESC LIMIT _limit
      ) t
    ),
    'manufacturers', (
      SELECT coalesce(jsonb_agg(t), '[]'::jsonb) FROM (
        SELECT gm.manufacturer_name_cached AS manufacturer_name, count(a.id) AS adoptions
        FROM global_medicine_adoptions a
        JOIN global_medicines gm ON gm.id = a.global_medicine_id
        WHERE gm.manufacturer_name_cached IS NOT NULL
        GROUP BY gm.manufacturer_name_cached ORDER BY count(a.id) DESC LIMIT _limit
      ) t
    )
  ) INTO v;
  RETURN v;
END $$;

GRANT EXECUTE ON FUNCTION public.top_adopted_breakdown(int) TO authenticated;
