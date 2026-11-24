
ALTER TABLE public.branch_settings
  ADD COLUMN IF NOT EXISTS receipt_footer text,
  ADD COLUMN IF NOT EXISTS low_stock_threshold integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS expiry_alert_days integer NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS printer_settings jsonb NOT NULL DEFAULT '{}'::jsonb;
