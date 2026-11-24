
-- B10 Enterprise expansion

-- 1. Tenant branding
CREATE TABLE IF NOT EXISTS public.tenant_branding (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  brand_name text,
  logo_url text,
  favicon_url text,
  login_bg_url text,
  primary_color text,
  secondary_color text,
  accent_color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_branding TO authenticated;
GRANT ALL ON public.tenant_branding TO service_role;
ALTER TABLE public.tenant_branding ENABLE ROW LEVEL SECURITY;
CREATE POLICY tb_member_all ON public.tenant_branding
  FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE TRIGGER tb_set_updated_at BEFORE UPDATE ON public.tenant_branding
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Custom domains
CREATE TABLE IF NOT EXISTS public.tenant_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  domain text NOT NULL UNIQUE,
  verification_token text NOT NULL DEFAULT encode(gen_random_bytes(16),'hex'),
  verified boolean NOT NULL DEFAULT false,
  ssl_status text NOT NULL DEFAULT 'pending',
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_domains TO authenticated;
GRANT ALL ON public.tenant_domains TO service_role;
ALTER TABLE public.tenant_domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY td_member_all ON public.tenant_domains
  FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE INDEX IF NOT EXISTS idx_tenant_domains_tenant ON public.tenant_domains(tenant_id);

-- 3. Franchise hierarchy: add parent + role on branches
ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS parent_branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS branch_role text NOT NULL DEFAULT 'branch',
  ADD COLUMN IF NOT EXISTS royalty_percent numeric(5,2) NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_branches_parent ON public.branches(parent_branch_id);

-- 4. Warehouses: HQ flag
ALTER TABLE public.warehouses
  ADD COLUMN IF NOT EXISTS is_hq boolean NOT NULL DEFAULT false;

-- 5. Inter-branch stock transfers
DO $$ BEGIN
  CREATE TYPE public.transfer_status AS ENUM ('requested','approved','in_transit','received','rejected','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.stock_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  transfer_no text NOT NULL,
  from_branch_id uuid NOT NULL REFERENCES public.branches(id),
  to_branch_id uuid NOT NULL REFERENCES public.branches(id),
  status public.transfer_status NOT NULL DEFAULT 'requested',
  requested_by uuid REFERENCES auth.users(id),
  approved_by uuid REFERENCES auth.users(id),
  received_by uuid REFERENCES auth.users(id),
  notes text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  shipped_at timestamptz,
  received_at timestamptz,
  UNIQUE (tenant_id, transfer_no)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_transfers TO authenticated;
GRANT ALL ON public.stock_transfers TO service_role;
ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY st_member_all ON public.stock_transfers
  FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE INDEX IF NOT EXISTS idx_stock_transfers_tenant_status ON public.stock_transfers(tenant_id, status);

CREATE TABLE IF NOT EXISTS public.stock_transfer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  transfer_id uuid NOT NULL REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  batch_id uuid REFERENCES public.batches(id),
  qty_requested numeric NOT NULL CHECK (qty_requested > 0),
  qty_sent numeric NOT NULL DEFAULT 0,
  qty_received numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_transfer_items TO authenticated;
GRANT ALL ON public.stock_transfer_items TO service_role;
ALTER TABLE public.stock_transfer_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY sti_member_all ON public.stock_transfer_items
  FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE INDEX IF NOT EXISTS idx_sti_transfer ON public.stock_transfer_items(transfer_id);

-- 6. Royalty settlements
CREATE TABLE IF NOT EXISTS public.royalty_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  gross_revenue numeric NOT NULL DEFAULT 0,
  royalty_percent numeric(5,2) NOT NULL DEFAULT 0,
  royalty_amount numeric NOT NULL DEFAULT 0,
  commission_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id, period_start, period_end)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.royalty_settlements TO authenticated;
GRANT ALL ON public.royalty_settlements TO service_role;
ALTER TABLE public.royalty_settlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY rs_member_all ON public.royalty_settlements
  FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

-- 7. Additive roles for enterprise hierarchy
DO $$ BEGIN
  ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'regional_manager';
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'auditor';
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'corporate_admin';
EXCEPTION WHEN others THEN NULL; END $$;

-- 8. HQ rollup view (multi-branch dashboard source)
CREATE OR REPLACE VIEW public.v_branch_performance AS
SELECT
  b.tenant_id,
  b.id  AS branch_id,
  b.name AS branch_name,
  b.parent_branch_id,
  COALESCE(SUM(s.total),0)               AS gross_sales,
  COALESCE(SUM(s.total - s.discount),0)  AS net_sales,
  COALESCE(SUM(s.paid),0)                AS collected,
  COALESCE(SUM(s.due),0)                 AS outstanding,
  COUNT(s.id)                            AS invoice_count
FROM public.branches b
LEFT JOIN public.sales s
  ON s.tenant_id = b.tenant_id
 AND s.created_at >= date_trunc('month', now())
GROUP BY b.tenant_id, b.id, b.name, b.parent_branch_id;

GRANT SELECT ON public.v_branch_performance TO authenticated;
