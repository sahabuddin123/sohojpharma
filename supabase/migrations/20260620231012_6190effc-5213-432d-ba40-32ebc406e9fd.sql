
ALTER TABLE public.tenant_settings
  ADD COLUMN IF NOT EXISTS printers jsonb NOT NULL DEFAULT jsonb_build_object(
    'default_receipt_printer', null,
    'default_invoice_printer', null,
    'default_barcode_printer', null,
    'default_label_printer', null,
    'auto_print_receipt', false,
    'auto_print_invoice', false,
    'auto_print_barcode', false,
    'receipt_format', '80mm',
    'invoice_format', 'A4',
    'barcode_format', 'standard',
    'thermal', jsonb_build_object('show_logo', true, 'show_footer', true, 'show_qr', false, 'show_tax_summary', true, 'show_cashier', true),
    'a4', jsonb_build_object('show_header', true, 'show_footer', true, 'show_terms', true, 'show_signature', true, 'watermark', false),
    'barcode', jsonb_build_object('symbology', 'CODE128', 'label_size', '40x20')
  );

CREATE TABLE IF NOT EXISTS public.printer_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  printer_type text NOT NULL,    -- thermal | a4 | barcode | label | pdf
  driver text,                   -- e.g. ESC/POS, CUPS, browser, network
  paper_size text,               -- 58mm | 80mm | A4 | 40x20 | custom
  status text NOT NULL DEFAULT 'active',
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  connection jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.printer_profiles TO authenticated;
GRANT ALL ON public.printer_profiles TO service_role;
ALTER TABLE public.printer_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "printer_profiles_select_member"
  ON public.printer_profiles FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tenant_members tm
                 WHERE tm.tenant_id = printer_profiles.tenant_id AND tm.user_id = auth.uid()));

CREATE POLICY "printer_profiles_write_admin"
  ON public.printer_profiles FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), tenant_id, 'owner')
    OR public.has_role(auth.uid(), tenant_id, 'corporate_admin')
    OR public.has_role(auth.uid(), tenant_id, 'manager')
  )
  WITH CHECK (
    public.has_role(auth.uid(), tenant_id, 'owner')
    OR public.has_role(auth.uid(), tenant_id, 'corporate_admin')
    OR public.has_role(auth.uid(), tenant_id, 'manager')
  );

CREATE TABLE IF NOT EXISTS public.print_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  template_type text NOT NULL,   -- receipt | invoice | barcode | label | statement | purchase_order | grn | purchase_return | sales_return
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.print_templates TO authenticated;
GRANT ALL ON public.print_templates TO service_role;
ALTER TABLE public.print_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "print_templates_select_member"
  ON public.print_templates FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tenant_members tm
                 WHERE tm.tenant_id = print_templates.tenant_id AND tm.user_id = auth.uid()));

CREATE POLICY "print_templates_write_admin"
  ON public.print_templates FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), tenant_id, 'owner')
    OR public.has_role(auth.uid(), tenant_id, 'corporate_admin')
    OR public.has_role(auth.uid(), tenant_id, 'manager')
  )
  WITH CHECK (
    public.has_role(auth.uid(), tenant_id, 'owner')
    OR public.has_role(auth.uid(), tenant_id, 'corporate_admin')
    OR public.has_role(auth.uid(), tenant_id, 'manager')
  );

CREATE OR REPLACE FUNCTION public.touch_printer_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;$$;

DROP TRIGGER IF EXISTS trg_printer_profiles_touch ON public.printer_profiles;
CREATE TRIGGER trg_printer_profiles_touch
  BEFORE UPDATE ON public.printer_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_printer_updated_at();

DROP TRIGGER IF EXISTS trg_print_templates_touch ON public.print_templates;
CREATE TRIGGER trg_print_templates_touch
  BEFORE UPDATE ON public.print_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_printer_updated_at();
