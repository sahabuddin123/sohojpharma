
-- 1) tenant_settings.payments column
ALTER TABLE public.tenant_settings
  ADD COLUMN IF NOT EXISTS payments jsonb NOT NULL DEFAULT jsonb_build_object(
    'cash_enabled', true,
    'card_enabled', true,
    'bank_enabled', true,
    'bkash_enabled', true,
    'nagad_enabled', true,
    'rocket_enabled', true,
    'credit_sale_enabled', true,
    'partial_payment_enabled', true,
    'refund_enabled', true,
    'auto_reconcile', false,
    'default_payment_method', 'cash'
  );

-- 2) payment_gateways
CREATE TABLE IF NOT EXISTS public.payment_gateways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  merchant_id text,
  api_key text,
  secret_key text,
  webhook_url text,
  sandbox boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'inactive',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_gateways TO authenticated;
GRANT ALL ON public.payment_gateways TO service_role;
ALTER TABLE public.payment_gateways ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gateways_select" ON public.payment_gateways
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tenant_members tm
                 WHERE tm.tenant_id = payment_gateways.tenant_id AND tm.user_id = auth.uid()));
CREATE POLICY "gateways_write" ON public.payment_gateways
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), tenant_id, 'owner')
      OR public.has_role(auth.uid(), tenant_id, 'corporate_admin')
      OR public.has_role(auth.uid(), tenant_id, 'manager'))
  WITH CHECK (public.has_role(auth.uid(), tenant_id, 'owner')
      OR public.has_role(auth.uid(), tenant_id, 'corporate_admin')
      OR public.has_role(auth.uid(), tenant_id, 'manager'));

-- 3) payment_settlements
CREATE TABLE IF NOT EXISTS public.payment_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  gateway_id uuid REFERENCES public.payment_gateways(id) ON DELETE SET NULL,
  provider text NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  fees numeric(14,2) NOT NULL DEFAULT 0,
  net_amount numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  reference text,
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_settlements TO authenticated;
GRANT ALL ON public.payment_settlements TO service_role;
ALTER TABLE public.payment_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settlements_select" ON public.payment_settlements
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tenant_members tm
                 WHERE tm.tenant_id = payment_settlements.tenant_id AND tm.user_id = auth.uid()));
CREATE POLICY "settlements_write" ON public.payment_settlements
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), tenant_id, 'owner')
      OR public.has_role(auth.uid(), tenant_id, 'corporate_admin')
      OR public.has_role(auth.uid(), tenant_id, 'manager'))
  WITH CHECK (public.has_role(auth.uid(), tenant_id, 'owner')
      OR public.has_role(auth.uid(), tenant_id, 'corporate_admin')
      OR public.has_role(auth.uid(), tenant_id, 'manager'));

CREATE INDEX IF NOT EXISTS idx_settlements_tenant_date ON public.payment_settlements(tenant_id, created_at DESC);
