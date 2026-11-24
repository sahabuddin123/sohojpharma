
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE TABLE public.medicine_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_name text NOT NULL,
  generic_name text NOT NULL,
  strength text,
  dosage_form text,
  manufacturer text,
  pack_size text,
  dar_no text,
  mrp numeric(12,2),
  indication text,
  is_prescription_required boolean NOT NULL DEFAULT false,
  search_tsv tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(brand_name,'')), 'A') ||
    setweight(to_tsvector('simple', coalesce(generic_name,'')), 'B') ||
    setweight(to_tsvector('simple', coalesce(manufacturer,'')), 'C')
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(brand_name, strength, dosage_form, manufacturer)
);
CREATE INDEX idx_medicine_master_tsv     ON public.medicine_master USING gin (search_tsv);
CREATE INDEX idx_medicine_master_brand   ON public.medicine_master USING gin (brand_name extensions.gin_trgm_ops);
CREATE INDEX idx_medicine_master_generic ON public.medicine_master USING gin (generic_name extensions.gin_trgm_ops);
CREATE INDEX idx_medicine_master_mfg     ON public.medicine_master USING gin (manufacturer extensions.gin_trgm_ops);

GRANT SELECT ON public.medicine_master TO authenticated;
GRANT ALL    ON public.medicine_master TO service_role;
ALTER TABLE public.medicine_master ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read master" ON public.medicine_master
  FOR SELECT TO authenticated USING (true);
CREATE TRIGGER trg_medicine_master_updated_at
  BEFORE UPDATE ON public.medicine_master
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.medicine_alternatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medicine_id uuid NOT NULL REFERENCES public.medicine_master(id) ON DELETE CASCADE,
  alternative_id uuid NOT NULL REFERENCES public.medicine_master(id) ON DELETE CASCADE,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(medicine_id, alternative_id),
  CHECK (medicine_id <> alternative_id)
);
CREATE INDEX idx_medicine_alt_medicine ON public.medicine_alternatives(medicine_id);

GRANT SELECT ON public.medicine_alternatives TO authenticated;
GRANT ALL    ON public.medicine_alternatives TO service_role;
ALTER TABLE public.medicine_alternatives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read alternatives" ON public.medicine_alternatives
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.search_medicines(_q text, _limit int DEFAULT 50)
RETURNS TABLE(
  id uuid, brand_name text, generic_name text, strength text,
  dosage_form text, manufacturer text, pack_size text, mrp numeric,
  is_prescription_required boolean, rank real
)
LANGUAGE sql STABLE SET search_path = public, extensions AS $$
  SELECT m.id, m.brand_name, m.generic_name, m.strength, m.dosage_form,
         m.manufacturer, m.pack_size, m.mrp, m.is_prescription_required,
         GREATEST(
           extensions.similarity(m.brand_name, COALESCE(_q,'')),
           extensions.similarity(m.generic_name, COALESCE(_q,'')),
           extensions.similarity(COALESCE(m.manufacturer,''), COALESCE(_q,''))
         )::real AS rank
    FROM public.medicine_master m
   WHERE _q IS NULL OR _q = '' OR
         m.search_tsv @@ plainto_tsquery('simple', _q) OR
         m.brand_name   ILIKE '%'||_q||'%' OR
         m.generic_name ILIKE '%'||_q||'%' OR
         m.manufacturer ILIKE '%'||_q||'%'
   ORDER BY rank DESC NULLS LAST, m.brand_name
   LIMIT COALESCE(_limit, 50);
$$;
REVOKE ALL ON FUNCTION public.search_medicines(text,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_medicines(text,int) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_product_from_medicine(
  _tenant_id uuid, _medicine_id uuid,
  _purchase_price numeric DEFAULT NULL,
  _retail_price numeric DEFAULT NULL,
  _sku text DEFAULT NULL
) RETURNS public.products
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_m public.medicine_master;
  v_mfg uuid; v_gen uuid;
  v_prod public.products;
  v_sku text;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_m FROM public.medicine_master WHERE id = _medicine_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'medicine not found' USING ERRCODE='23503'; END IF;

  IF v_m.manufacturer IS NOT NULL THEN
    SELECT id INTO v_mfg FROM public.manufacturers
      WHERE tenant_id = _tenant_id AND lower(name) = lower(v_m.manufacturer);
    IF v_mfg IS NULL THEN
      INSERT INTO public.manufacturers(tenant_id, name) VALUES(_tenant_id, v_m.manufacturer)
      RETURNING id INTO v_mfg;
    END IF;
  END IF;

  SELECT id INTO v_gen FROM public.generics
    WHERE tenant_id = _tenant_id AND lower(name) = lower(v_m.generic_name);
  IF v_gen IS NULL THEN
    INSERT INTO public.generics(tenant_id, name) VALUES(_tenant_id, v_m.generic_name)
    RETURNING id INTO v_gen;
  END IF;

  v_sku := COALESCE(_sku, 'MED-' || substr(_medicine_id::text,1,8));

  INSERT INTO public.products(
    tenant_id, sku, name, manufacturer_id, generic_id,
    pack_size, purchase_price, retail_price, is_prescription_required
  ) VALUES (
    _tenant_id, v_sku,
    v_m.brand_name || COALESCE(' '||v_m.strength,'') || COALESCE(' '||v_m.dosage_form,''),
    v_mfg, v_gen,
    NULLIF(regexp_replace(COALESCE(v_m.pack_size,''),'\D','','g'),'')::int,
    COALESCE(_purchase_price, ROUND(COALESCE(v_m.mrp,0) * 0.85, 2)),
    COALESCE(_retail_price,   COALESCE(v_m.mrp, 0)),
    v_m.is_prescription_required
  ) RETURNING * INTO v_prod;

  RETURN v_prod;
END $$;
REVOKE ALL ON FUNCTION public.create_product_from_medicine(uuid,uuid,numeric,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_product_from_medicine(uuid,uuid,numeric,numeric,text) TO authenticated;
