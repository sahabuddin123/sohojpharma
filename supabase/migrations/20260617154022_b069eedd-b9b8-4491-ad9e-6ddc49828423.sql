
-- Invoice settings (per branch optional)
CREATE TABLE public.invoice_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  company_name text NOT NULL DEFAULT '',
  address text DEFAULT '',
  phone text DEFAULT '',
  email text DEFAULT '',
  website text DEFAULT '',
  trade_license text DEFAULT '',
  bin_number text DEFAULT '',
  tin_number text DEFAULT '',
  logo_url text DEFAULT '',
  footer_message text DEFAULT 'Thank you for your purchase!',
  terms_conditions text DEFAULT '',
  template text NOT NULL DEFAULT 'classic',
  thermal_width text NOT NULL DEFAULT '80mm',
  primary_color text DEFAULT '#0ea5e9',
  font_family text DEFAULT 'system-ui',
  show_qr boolean DEFAULT true,
  show_barcode boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, branch_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_settings TO authenticated;
GRANT ALL ON public.invoice_settings TO service_role;
ALTER TABLE public.invoice_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members read invoice_settings" ON public.invoice_settings FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "branch admins manage invoice_settings" ON public.invoice_settings FOR ALL TO authenticated
  USING (public.is_branch_admin(auth.uid(), tenant_id))
  WITH CHECK (public.is_branch_admin(auth.uid(), tenant_id));
CREATE TRIGGER invoice_settings_updated_at BEFORE UPDATE ON public.invoice_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Print logs
CREATE TABLE public.invoice_print_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sale_id uuid REFERENCES public.sales(id) ON DELETE CASCADE,
  return_id uuid REFERENCES public.sales_returns(id) ON DELETE CASCADE,
  payment_id uuid REFERENCES public.customer_payments(id) ON DELETE CASCADE,
  invoice_no text NOT NULL,
  format text NOT NULL,
  printed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.invoice_print_logs TO authenticated;
GRANT ALL ON public.invoice_print_logs TO service_role;
ALTER TABLE public.invoice_print_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members manage print logs" ON public.invoice_print_logs FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE INDEX invoice_print_logs_sale_idx ON public.invoice_print_logs(sale_id);

-- Share logs
CREATE TABLE public.invoice_share_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sale_id uuid REFERENCES public.sales(id) ON DELETE CASCADE,
  return_id uuid REFERENCES public.sales_returns(id) ON DELETE CASCADE,
  payment_id uuid REFERENCES public.customer_payments(id) ON DELETE CASCADE,
  invoice_no text NOT NULL,
  channel text NOT NULL,
  recipient text,
  shared_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.invoice_share_logs TO authenticated;
GRANT ALL ON public.invoice_share_logs TO service_role;
ALTER TABLE public.invoice_share_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members manage share logs" ON public.invoice_share_logs FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE INDEX invoice_share_logs_sale_idx ON public.invoice_share_logs(sale_id);
