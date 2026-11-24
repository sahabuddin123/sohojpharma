CREATE TABLE public.held_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  label text,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  cart jsonb NOT NULL,
  held_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resumed_at timestamptz
);
CREATE INDEX idx_held_sales_tenant ON public.held_sales(tenant_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.held_sales TO authenticated;
GRANT ALL ON public.held_sales TO service_role;
ALTER TABLE public.held_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY held_sales_tenant_all ON public.held_sales FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));