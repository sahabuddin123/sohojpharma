
-- 1) Clean existing logical duplicates: keep the oldest active row per logical key, soft-delete the rest.
WITH ranked AS (
  SELECT id, tenant_id,
         ROW_NUMBER() OVER (
           PARTITION BY tenant_id,
                        lower(btrim(name)),
                        COALESCE(generic_id::text, ''),
                        COALESCE(manufacturer_id::text, ''),
                        lower(COALESCE(btrim(strength), ''))
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.products
  WHERE deleted_at IS NULL
)
UPDATE public.products p
SET deleted_at = now(),
    status = 'inactive',
    is_active = false,
    updated_at = now()
FROM ranked r
WHERE p.id = r.id AND r.rn > 1;

-- 2) Logical duplicate unique index (active rows only).
CREATE UNIQUE INDEX IF NOT EXISTS products_tenant_logical_uidx
  ON public.products (
    tenant_id,
    lower(btrim(name)),
    COALESCE(generic_id::text, ''),
    COALESCE(manufacturer_id::text, ''),
    lower(COALESCE(btrim(strength), ''))
  )
  WHERE deleted_at IS NULL;

-- 3) Friendly duplicate trigger: translate unique violations to clear message.
CREATE OR REPLACE FUNCTION public.products_friendly_duplicate_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Barcode duplicate (active rows)
  IF NEW.barcode IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.products
    WHERE tenant_id = NEW.tenant_id
      AND barcode = NEW.barcode
      AND deleted_at IS NULL
      AND id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'Product already exists (barcode): এই পণ্যটি ইতোমধ্যে সিস্টেমে বিদ্যমান'
      USING ERRCODE = 'unique_violation';
  END IF;

  -- SKU duplicate
  IF EXISTS (
    SELECT 1 FROM public.products
    WHERE tenant_id = NEW.tenant_id
      AND sku = NEW.sku
      AND id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'Product already exists (sku): এই পণ্যটি ইতোমধ্যে সিস্টেমে বিদ্যমান'
      USING ERRCODE = 'unique_violation';
  END IF;

  -- Logical duplicate
  IF EXISTS (
    SELECT 1 FROM public.products
    WHERE tenant_id = NEW.tenant_id
      AND deleted_at IS NULL
      AND id <> NEW.id
      AND lower(btrim(name)) = lower(btrim(NEW.name))
      AND COALESCE(generic_id::text, '') = COALESCE(NEW.generic_id::text, '')
      AND COALESCE(manufacturer_id::text, '') = COALESCE(NEW.manufacturer_id::text, '')
      AND lower(COALESCE(btrim(strength), '')) = lower(COALESCE(btrim(NEW.strength), ''))
  ) THEN
    RAISE EXCEPTION 'Product already exists: এই পণ্যটি ইতোমধ্যে সিস্টেমে বিদ্যমান'
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_friendly_duplicate_check ON public.products;
CREATE TRIGGER trg_products_friendly_duplicate_check
BEFORE INSERT OR UPDATE OF name, generic_id, manufacturer_id, strength, barcode, sku, deleted_at
ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.products_friendly_duplicate_check();

-- 4) Duplicate scanner RPC.
CREATE OR REPLACE FUNCTION public.scan_product_duplicates(_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_logical jsonb;
  v_barcode jsonb;
  v_sku jsonb;
BEGIN
  WITH g AS (
    SELECT lower(btrim(name)) AS k_name,
           COALESCE(generic_id::text,'') AS k_generic,
           COALESCE(manufacturer_id::text,'') AS k_mfr,
           lower(COALESCE(btrim(strength),'')) AS k_strength,
           jsonb_agg(jsonb_build_object(
             'id', id, 'name', name, 'sku', sku, 'barcode', barcode,
             'created_at', created_at, 'strength', strength
           ) ORDER BY created_at) AS items,
           COUNT(*) AS c
    FROM public.products
    WHERE tenant_id = _tenant_id AND deleted_at IS NULL
    GROUP BY 1,2,3,4
    HAVING COUNT(*) > 1
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('key', k_name, 'count', c, 'items', items)), '[]'::jsonb)
  INTO v_logical FROM g;

  WITH g AS (
    SELECT barcode,
           jsonb_agg(jsonb_build_object('id', id, 'name', name, 'sku', sku, 'created_at', created_at) ORDER BY created_at) AS items,
           COUNT(*) AS c
    FROM public.products
    WHERE tenant_id = _tenant_id AND deleted_at IS NULL AND barcode IS NOT NULL
    GROUP BY barcode HAVING COUNT(*) > 1
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('key', barcode, 'count', c, 'items', items)), '[]'::jsonb)
  INTO v_barcode FROM g;

  WITH g AS (
    SELECT sku,
           jsonb_agg(jsonb_build_object('id', id, 'name', name, 'barcode', barcode, 'created_at', created_at) ORDER BY created_at) AS items,
           COUNT(*) AS c
    FROM public.products
    WHERE tenant_id = _tenant_id AND deleted_at IS NULL
    GROUP BY sku HAVING COUNT(*) > 1
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('key', sku, 'count', c, 'items', items)), '[]'::jsonb)
  INTO v_sku FROM g;

  RETURN jsonb_build_object(
    'logical', v_logical,
    'barcode', v_barcode,
    'sku', v_sku
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.scan_product_duplicates(uuid) TO authenticated, service_role;

-- 5) Merge helper: soft-delete duplicates, keep master.
CREATE OR REPLACE FUNCTION public.merge_product_duplicates(_tenant_id uuid, _keep_id uuid, _dup_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.products
  SET deleted_at = now(), is_active = false, status = 'inactive', updated_at = now()
  WHERE tenant_id = _tenant_id
    AND id = ANY(_dup_ids)
    AND id <> _keep_id
    AND deleted_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('removed', v_count, 'kept', _keep_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_product_duplicates(uuid, uuid, uuid[]) TO authenticated, service_role;
