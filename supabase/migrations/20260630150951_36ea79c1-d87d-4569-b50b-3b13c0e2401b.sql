CREATE INDEX IF NOT EXISTS idx_products_fuzzy_match
  ON public.products (tenant_id, (lower(btrim(name))), manufacturer_id, generic_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_fuzzy_match_all
  ON public.products (tenant_id, (lower(btrim(name))));

ANALYZE public.products;