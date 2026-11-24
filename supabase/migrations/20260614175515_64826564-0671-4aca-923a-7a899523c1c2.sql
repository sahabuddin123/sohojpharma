
-- prescriptions
CREATE TABLE public.prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  image_path text,
  file_kind text NOT NULL DEFAULT 'image' CHECK (file_kind IN ('image','pdf')),
  ocr_text text,
  patient_name text,
  doctor_name text,
  prescription_date date,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected','converted')),
  notes text,
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prescriptions TO authenticated;
GRANT ALL ON public.prescriptions TO service_role;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members manage prescriptions"
  ON public.prescriptions FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE TRIGGER trg_prescriptions_updated
  BEFORE UPDATE ON public.prescriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_prescriptions_tenant_created ON public.prescriptions(tenant_id, created_at DESC);

-- prescription_items
CREATE TABLE public.prescription_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  prescription_id uuid NOT NULL REFERENCES public.prescriptions(id) ON DELETE CASCADE,
  raw_text text NOT NULL,
  brand_name text,
  generic_name text,
  strength text,
  dosage text,
  quantity numeric(12,2) DEFAULT 1,
  matched_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  confidence numeric(5,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'auto' CHECK (status IN ('auto','review','manual','unmatched','approved','rejected')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prescription_items TO authenticated;
GRANT ALL ON public.prescription_items TO service_role;
ALTER TABLE public.prescription_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members manage prescription items"
  ON public.prescription_items FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE TRIGGER trg_prescription_items_updated
  BEFORE UPDATE ON public.prescription_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_prescription_items_prescription ON public.prescription_items(prescription_id);

-- Storage policies (bucket created via tool)
CREATE POLICY "tenant members read prescription files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'prescriptions'
    AND public.is_tenant_member(auth.uid(), (split_part(name, '/', 1))::uuid)
  );
CREATE POLICY "tenant members upload prescription files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'prescriptions'
    AND public.is_tenant_member(auth.uid(), (split_part(name, '/', 1))::uuid)
  );
CREATE POLICY "tenant members delete prescription files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'prescriptions'
    AND public.is_tenant_member(auth.uid(), (split_part(name, '/', 1))::uuid)
  );
