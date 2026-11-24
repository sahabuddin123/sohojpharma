CREATE INDEX IF NOT EXISTS idx_products_tenant_id_live ON public.products (tenant_id, id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_generics_tenant_id_live ON public.generics (tenant_id, id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_manufacturers_tenant_id_live ON public.manufacturers (tenant_id, id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_categories_tenant_id_live ON public.categories (tenant_id, id) WHERE deleted_at IS NULL;