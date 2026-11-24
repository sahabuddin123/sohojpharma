ALTER TABLE public.held_sales ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.held_sales ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS held_sales_tenant_active_idx ON public.held_sales(tenant_id, created_at DESC) WHERE deleted_at IS NULL AND resumed_at IS NULL;