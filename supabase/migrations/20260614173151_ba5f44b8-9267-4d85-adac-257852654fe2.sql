
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS base_unit text NOT NULL DEFAULT 'pcs',
  ADD COLUMN IF NOT EXISTS purchase_unit text NOT NULL DEFAULT 'pcs',
  ADD COLUMN IF NOT EXISTS sale_unit text NOT NULL DEFAULT 'pcs',
  ADD COLUMN IF NOT EXISTS units_per_purchase numeric(14,3) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS units_per_sale numeric(14,3) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS vat_mode text NOT NULL DEFAULT 'exclusive'
    CHECK (vat_mode IN ('inclusive','exclusive','none'));

ALTER TABLE public.purchase_items
  ADD COLUMN IF NOT EXISTS bonus_qty numeric(14,3) NOT NULL DEFAULT 0;
