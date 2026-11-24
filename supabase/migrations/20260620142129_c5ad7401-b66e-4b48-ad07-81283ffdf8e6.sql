
ALTER TABLE public.invoice_settings
  ADD COLUMN IF NOT EXISTS invoice_prefix text NOT NULL DEFAULT 'INV-',
  ADD COLUMN IF NOT EXISTS starting_number integer NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS receipt_prefix text NOT NULL DEFAULT 'POS-',
  ADD COLUMN IF NOT EXISTS print_format text NOT NULL DEFAULT 'A4',
  ADD COLUMN IF NOT EXISTS drug_license text DEFAULT '',
  ADD COLUMN IF NOT EXISTS show_logo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_bin boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_tin boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_drug_license boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_signature boolean NOT NULL DEFAULT false;

-- Honor tenant prefix and starting_number; preserve per-month sequence with advisory lock.
CREATE OR REPLACE FUNCTION public.next_invoice_no(_tenant_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cfg_prefix text;
  v_cfg_start  int;
  v_prefix     text;
  v_seq        int;
  v_no         text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(_tenant_id::text, 0));

  SELECT COALESCE(NULLIF(invoice_prefix, ''), 'INV-'),
         COALESCE(starting_number, 1000)
    INTO v_cfg_prefix, v_cfg_start
    FROM public.invoice_settings
   WHERE tenant_id = _tenant_id AND branch_id IS NULL
   LIMIT 1;

  v_cfg_prefix := COALESCE(v_cfg_prefix, 'INV-');
  v_cfg_start  := COALESCE(v_cfg_start, 1000);

  v_prefix := v_cfg_prefix || to_char(now() AT TIME ZONE 'UTC', 'YYYYMM') || '-';

  SELECT COALESCE(MAX(NULLIF(regexp_replace(invoice_no, '^' || v_prefix, ''), '')::int), 0)
    INTO v_seq
    FROM public.sales
   WHERE tenant_id = _tenant_id
     AND invoice_no LIKE v_prefix || '%'
     AND invoice_no ~ ('^' || v_prefix || '[0-9]+$');

  v_seq := GREATEST(v_seq + 1, v_cfg_start + 1);
  v_no  := v_prefix || lpad(v_seq::text, 6, '0');
  RETURN v_no;
END $function$;
