
-- Add customer_code for human-friendly identifier
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS customer_code text;

-- Backfill existing rows: CUS-YYYY#### using created_at year and per-tenant row_number
WITH numbered AS (
  SELECT id,
         to_char(created_at, 'YYYY') AS yr,
         row_number() OVER (PARTITION BY tenant_id ORDER BY created_at, id) AS rn
  FROM public.customers
  WHERE customer_code IS NULL
)
UPDATE public.customers c
SET customer_code = 'CUS-' || n.yr || lpad(n.rn::text, 4, '0')
FROM numbered n
WHERE c.id = n.id;

CREATE UNIQUE INDEX IF NOT EXISTS customers_tenant_code_uidx ON public.customers(tenant_id, customer_code);

-- Trigger to auto-generate code on insert when missing
CREATE OR REPLACE FUNCTION public.set_customer_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_yr text := to_char(coalesce(NEW.created_at, now()), 'YYYY');
  v_next int;
BEGIN
  IF NEW.customer_code IS NULL OR NEW.customer_code = '' THEN
    SELECT coalesce(max(substring(customer_code from 9)::int), 0) + 1
    INTO v_next
    FROM public.customers
    WHERE tenant_id = NEW.tenant_id
      AND customer_code LIKE 'CUS-' || v_yr || '%';
    NEW.customer_code := 'CUS-' || v_yr || lpad(v_next::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customers_set_code ON public.customers;
CREATE TRIGGER trg_customers_set_code
  BEFORE INSERT ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_customer_code();
