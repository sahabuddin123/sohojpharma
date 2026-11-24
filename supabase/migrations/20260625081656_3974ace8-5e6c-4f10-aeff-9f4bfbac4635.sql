
-- Dedup: keep most-recent row per (tenant_id, branch_id NULLS NOT DISTINCT)
DELETE FROM public.invoice_settings a
USING public.invoice_settings b
WHERE a.tenant_id = b.tenant_id
  AND a.branch_id IS NOT DISTINCT FROM b.branch_id
  AND (a.updated_at, a.id) < (b.updated_at, b.id);

ALTER TABLE public.invoice_settings
  DROP CONSTRAINT IF EXISTS invoice_settings_tenant_id_branch_id_key;

ALTER TABLE public.invoice_settings
  ADD CONSTRAINT invoice_settings_tenant_id_branch_id_key
  UNIQUE NULLS NOT DISTINCT (tenant_id, branch_id);
