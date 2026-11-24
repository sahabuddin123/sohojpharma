-- Phase 3.2 — Global Medicine Network foundation

CREATE TABLE IF NOT EXISTS public.global_generics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  atc_code text,
  therapeutic_class text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT global_generics_name_uniq UNIQUE (name)
);
GRANT SELECT ON public.global_generics TO authenticated;
GRANT ALL    ON public.global_generics TO service_role;
ALTER TABLE public.global_generics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "global_generics_read" ON public.global_generics
  FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.global_manufacturers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  country text,
  code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT global_manufacturers_name_uniq UNIQUE (name)
);
GRANT SELECT ON public.global_manufacturers TO authenticated;
GRANT ALL    ON public.global_manufacturers TO service_role;
ALTER TABLE public.global_manufacturers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "global_manufacturers_read" ON public.global_manufacturers
  FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.global_medicines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_name text NOT NULL,
  generic_id uuid REFERENCES public.global_generics(id) ON DELETE SET NULL,
  manufacturer_id uuid REFERENCES public.global_manufacturers(id) ON DELETE SET NULL,
  strength text,
  dosage_form text,
  route text,
  description text,
  prescription_required boolean NOT NULL DEFAULT false,
  atc_code text,
  search_tsv tsvector,
  created_by_tenant uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  approved boolean NOT NULL DEFAULT true,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT global_medicines_identity_uniq
    UNIQUE (brand_name, generic_id, manufacturer_id, strength, dosage_form)
);
GRANT SELECT ON public.global_medicines TO authenticated;
GRANT ALL    ON public.global_medicines TO service_role;
ALTER TABLE public.global_medicines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "global_medicines_read" ON public.global_medicines
  FOR SELECT TO authenticated USING (approved = true OR public.is_app_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_global_medicines_tsv
  ON public.global_medicines USING gin (search_tsv);
CREATE INDEX IF NOT EXISTS idx_global_medicines_brand_trgm
  ON public.global_medicines USING gin (brand_name extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_global_medicines_generic ON public.global_medicines (generic_id);
CREATE INDEX IF NOT EXISTS idx_global_medicines_mfr     ON public.global_medicines (manufacturer_id);

CREATE OR REPLACE FUNCTION public.global_medicines_tsv_trigger()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.search_tsv :=
    setweight(to_tsvector('simple', coalesce(NEW.brand_name,'')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.strength,'')),  'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.dosage_form,'')), 'C');
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_global_medicines_tsv ON public.global_medicines;
CREATE TRIGGER trg_global_medicines_tsv BEFORE INSERT OR UPDATE ON public.global_medicines
  FOR EACH ROW EXECUTE FUNCTION public.global_medicines_tsv_trigger();

CREATE TABLE IF NOT EXISTS public.global_barcodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode text NOT NULL,
  global_medicine_id uuid NOT NULL REFERENCES public.global_medicines(id) ON DELETE CASCADE,
  barcode_type text NOT NULL DEFAULT 'EAN13',
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT global_barcodes_uniq UNIQUE (barcode)
);
GRANT SELECT ON public.global_barcodes TO authenticated;
GRANT ALL    ON public.global_barcodes TO service_role;
ALTER TABLE public.global_barcodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "global_barcodes_read" ON public.global_barcodes FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_global_barcodes_med ON public.global_barcodes(global_medicine_id);

CREATE TABLE IF NOT EXISTS public.global_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  global_medicine_id uuid NOT NULL REFERENCES public.global_medicines(id) ON DELETE CASCADE,
  pack_size text NOT NULL,
  units_per_pack integer,
  mrp numeric(14,2),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.global_packs TO authenticated;
GRANT ALL    ON public.global_packs TO service_role;
ALTER TABLE public.global_packs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "global_packs_read" ON public.global_packs FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.global_medicine_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  global_medicine_id uuid NOT NULL REFERENCES public.global_medicines(id) ON DELETE CASCADE,
  alias text NOT NULL,
  lang text NOT NULL DEFAULT 'en',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT global_medicine_aliases_uniq UNIQUE (global_medicine_id, alias, lang)
);
GRANT SELECT ON public.global_medicine_aliases TO authenticated;
GRANT ALL    ON public.global_medicine_aliases TO service_role;
ALTER TABLE public.global_medicine_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "global_medicine_aliases_read" ON public.global_medicine_aliases FOR SELECT TO authenticated USING (true);

DO $$ BEGIN
  CREATE TYPE public.contribution_status AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.global_medicine_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  proposed_data jsonb NOT NULL,
  status public.contribution_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_notes text,
  resulting_medicine_id uuid REFERENCES public.global_medicines(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.global_medicine_contributions TO authenticated;
GRANT ALL ON public.global_medicine_contributions TO service_role;
ALTER TABLE public.global_medicine_contributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contrib_tenant_select" ON public.global_medicine_contributions
  FOR SELECT TO authenticated
  USING (public.is_app_admin(auth.uid()) OR public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "contrib_tenant_insert" ON public.global_medicine_contributions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE INDEX IF NOT EXISTS idx_contrib_status ON public.global_medicine_contributions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contrib_tenant ON public.global_medicine_contributions(tenant_id, created_at DESC);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS global_medicine_id uuid
    REFERENCES public.global_medicines(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_products_global_medicine
  ON public.products(global_medicine_id) WHERE global_medicine_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_tenant_global
  ON public.products(tenant_id, global_medicine_id) WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.match_global_medicine(
  _brand text, _generic text, _mfr text, _strength text, _form text
) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT gm.id
  FROM public.global_medicines gm
  LEFT JOIN public.global_generics gg       ON gg.id = gm.generic_id
  LEFT JOIN public.global_manufacturers ggm ON ggm.id = gm.manufacturer_id
  WHERE lower(trim(gm.brand_name)) = lower(trim(coalesce(_brand,'')))
    AND coalesce(lower(trim(gm.strength)),'')    = coalesce(lower(trim(_strength)),'')
    AND coalesce(lower(trim(gm.dosage_form)),'') = coalesce(lower(trim(_form)),'')
    AND (_generic IS NULL OR lower(trim(gg.name))  = lower(trim(_generic)))
    AND (_mfr     IS NULL OR lower(trim(ggm.name)) = lower(trim(_mfr)))
    AND gm.approved = true
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.match_global_medicine(text,text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.contribute_global_medicine(
  _tenant uuid, _product uuid, _payload jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_existing uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_tenant_member(auth.uid(), _tenant) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT id INTO v_existing FROM public.global_medicine_contributions
   WHERE tenant_id=_tenant AND product_id=_product AND status='pending' LIMIT 1;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  INSERT INTO public.global_medicine_contributions(tenant_id, product_id, proposed_data, created_by)
  VALUES (_tenant, _product, _payload, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.contribute_global_medicine(uuid,uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_global_contribution(_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.global_medicine_contributions; v_med uuid; v_gen uuid; v_mfr uuid; p jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_app_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT * INTO c FROM public.global_medicine_contributions WHERE id=_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF c.status <> 'pending' THEN RAISE EXCEPTION 'already_reviewed'; END IF;
  p := c.proposed_data;

  IF nullif(p->>'generic_name','') IS NOT NULL THEN
    INSERT INTO public.global_generics(name) VALUES (trim(p->>'generic_name'))
      ON CONFLICT (name) DO UPDATE SET updated_at=now()
      RETURNING id INTO v_gen;
  END IF;
  IF nullif(p->>'manufacturer_name','') IS NOT NULL THEN
    INSERT INTO public.global_manufacturers(name) VALUES (trim(p->>'manufacturer_name'))
      ON CONFLICT (name) DO UPDATE SET updated_at=now()
      RETURNING id INTO v_mfr;
  END IF;

  INSERT INTO public.global_medicines(
    brand_name, generic_id, manufacturer_id, strength, dosage_form,
    prescription_required, created_by_tenant, approved, approved_by, approved_at
  ) VALUES (
    trim(p->>'brand_name'), v_gen, v_mfr,
    nullif(trim(p->>'strength'),''), nullif(trim(p->>'dosage_form'),''),
    coalesce((p->>'prescription_required')::boolean,false),
    c.tenant_id, true, auth.uid(), now()
  )
  ON CONFLICT (brand_name, generic_id, manufacturer_id, strength, dosage_form)
  DO UPDATE SET updated_at=now()
  RETURNING id INTO v_med;

  IF nullif(p->>'barcode','') IS NOT NULL THEN
    INSERT INTO public.global_barcodes(barcode, global_medicine_id, verified)
    VALUES (trim(p->>'barcode'), v_med, true) ON CONFLICT (barcode) DO NOTHING;
  END IF;

  IF c.product_id IS NOT NULL THEN
    UPDATE public.products SET global_medicine_id=v_med WHERE id=c.product_id;
  END IF;

  UPDATE public.global_medicine_contributions
     SET status='approved', reviewed_by=auth.uid(), reviewed_at=now(),
         resulting_medicine_id=v_med, updated_at=now()
   WHERE id=_id;
  RETURN v_med;
END $$;
GRANT EXECUTE ON FUNCTION public.approve_global_contribution(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_global_contribution(_id uuid, _notes text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_app_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.global_medicine_contributions
     SET status='rejected', reviewed_by=auth.uid(), reviewed_at=now(),
         review_notes=_notes, updated_at=now()
   WHERE id=_id AND status='pending';
END $$;
GRANT EXECUTE ON FUNCTION public.reject_global_contribution(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.search_global_medicines(
  _tenant uuid, _q text, _limit int DEFAULT 25
) RETURNS TABLE (
  source text, id uuid, brand_name text, generic_name text, manufacturer text,
  strength text, dosage_form text, already_in_catalog boolean, already_in_stock boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  (
    SELECT 'tenant'::text AS source,
           p.id, p.name AS brand_name,
           (SELECT name FROM public.generics g  WHERE g.id = p.generic_id) AS generic_name,
           (SELECT name FROM public.manufacturers mf WHERE mf.id = p.manufacturer_id) AS manufacturer,
           NULL::text AS strength, NULL::text AS dosage_form,
           true AS already_in_catalog,
           EXISTS (
             SELECT 1 FROM public.batches b
              WHERE b.tenant_id=_tenant AND b.product_id=p.id
                AND coalesce(b.qty_on_hand,0) > 0 AND b.deleted_at IS NULL
           ) AS already_in_stock
      FROM public.products p
     WHERE p.tenant_id=_tenant AND p.deleted_at IS NULL
       AND (_q='' OR p.name ILIKE '%'||_q||'%')
     ORDER BY p.name
     LIMIT _limit
  )
  UNION ALL
  (
    SELECT 'global'::text,
           gm.id, gm.brand_name,
           (SELECT name FROM public.global_generics      WHERE id=gm.generic_id),
           (SELECT name FROM public.global_manufacturers WHERE id=gm.manufacturer_id),
           gm.strength, gm.dosage_form,
           EXISTS (
             SELECT 1 FROM public.products p2
              WHERE p2.tenant_id=_tenant AND p2.global_medicine_id=gm.id AND p2.deleted_at IS NULL
           ),
           false
      FROM public.global_medicines gm
     WHERE gm.approved=true
       AND (_q='' OR gm.brand_name ILIKE '%'||_q||'%')
     ORDER BY gm.brand_name
     LIMIT _limit
  );
$$;
GRANT EXECUTE ON FUNCTION public.search_global_medicines(uuid,text,int) TO authenticated;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_global_generics_touch ON public.global_generics;
CREATE TRIGGER trg_global_generics_touch BEFORE UPDATE ON public.global_generics
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS trg_global_manufacturers_touch ON public.global_manufacturers;
CREATE TRIGGER trg_global_manufacturers_touch BEFORE UPDATE ON public.global_manufacturers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS trg_contrib_touch ON public.global_medicine_contributions;
CREATE TRIGGER trg_contrib_touch BEFORE UPDATE ON public.global_medicine_contributions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();