-- 1. Automatic Contribution Trigger
-- When a product is added to any tenant, ensure it is considered for the global catalog.

CREATE OR REPLACE FUNCTION public.auto_contribute_product_to_global()
RETURNS TRIGGER AS $$
DECLARE
    v_generic_name TEXT;
    v_manufacturer_name TEXT;
    v_payload JSONB;
BEGIN
    -- Only trigger if global_medicine_id is not set
    IF NEW.global_medicine_id IS NULL THEN
        -- Resolve generic and manufacturer names
        SELECT name INTO v_generic_name FROM public.generics WHERE id = NEW.generic_id;
        SELECT name INTO v_manufacturer_name FROM public.manufacturers WHERE id = NEW.manufacturer_id;

        -- Prepare payload matching ContributeInput schema
        v_payload := jsonb_build_object(
            'brand_name', NEW.name,
            'generic_name', v_generic_name,
            'manufacturer_name', v_manufacturer_name,
            'strength', NEW.strength,
            'dosage_form', NEW.medicine_type,
            'barcode', NEW.barcode
        );

        -- Call contribute_global_medicine (existing function)
        -- This will either match it immediately or queue it as a contribution
        PERFORM public.contribute_global_medicine(
            NEW.tenant_id,
            NEW.id,
            v_payload
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop if exists and recreate
DROP TRIGGER IF EXISTS trg_auto_contribute_on_product ON public.products;
CREATE TRIGGER trg_auto_contribute_on_product
    AFTER INSERT ON public.products
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_contribute_product_to_global();

-- 2. Push Global Catalog to All Tenants RPC
-- Links products in ALL tenants based on the current state of global_medicines.
CREATE OR REPLACE FUNCTION public.push_global_catalog_to_all_tenants()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_linked INTEGER := 0;
BEGIN
    -- Update all products that don't have a global_medicine_id yet,
    -- by matching them against global_medicines using brand, generic, mfr, strength, form.
    
    WITH matches AS (
        SELECT 
            p.id as product_id,
            gm.id as global_id
        FROM public.products p
        JOIN public.generics g ON p.generic_id = g.id
        JOIN public.manufacturers m ON p.manufacturer_id = m.id
        JOIN public.global_medicines gm ON 
            lower(trim(p.name)) = lower(trim(gm.brand_name))
        JOIN public.global_generics gg ON gm.generic_id = gg.id AND lower(trim(g.name)) = lower(trim(gg.name))
        JOIN public.global_manufacturers gmf ON gm.manufacturer_id = gmf.id AND lower(trim(m.name)) = lower(trim(gmf.name))
        WHERE p.global_medicine_id IS NULL
          AND lower(trim(COALESCE(p.strength, ''))) = lower(trim(COALESCE(gm.strength, '')))
          AND lower(trim(COALESCE(p.medicine_type, ''))) = lower(trim(COALESCE(gm.dosage_form, '')))
    )
    UPDATE public.products p
    SET global_medicine_id = m.global_id
    FROM matches m
    WHERE p.id = m.product_id;

    GET DIAGNOSTICS v_linked = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'linked_count', v_linked
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.push_global_catalog_to_all_tenants() TO authenticated;
GRANT EXECUTE ON FUNCTION public.push_global_catalog_to_all_tenants() TO service_role;
