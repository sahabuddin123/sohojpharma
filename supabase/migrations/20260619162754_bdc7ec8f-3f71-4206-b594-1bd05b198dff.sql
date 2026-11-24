
-- Switch to using existing tenants.procurement_settings JSONB instead of a new table.
DROP TABLE IF EXISTS public.procurement_settings;

-- Update default to include new key (existing rows return undefined → treated as false).
ALTER TABLE public.tenants
  ALTER COLUMN procurement_settings SET DEFAULT
    '{"require_grn_approval":false,"require_transfer_approval":true,"require_po_approval":true,"require_purchase_return_approval":false}'::jsonb;
