
-- Opening balances on parties
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS opening_balance numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS opening_balance numeric(14,2) NOT NULL DEFAULT 0;

-- Ledger entry-type enum
DO $$ BEGIN
  CREATE TYPE public.ledger_entry_type AS ENUM (
    'opening','sale','sales_return','collection',
    'purchase','purchase_return','payment','adjustment'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.party_type AS ENUM ('customer','supplier');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =================== PARTY LEDGER ===================
CREATE TABLE IF NOT EXISTS public.party_ledger (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  party_type  public.party_type NOT NULL,
  party_id    uuid NOT NULL,
  entry_date  timestamptz NOT NULL DEFAULT now(),
  entry_type  public.ledger_entry_type NOT NULL,
  debit       numeric(14,2) NOT NULL DEFAULT 0 CHECK (debit  >= 0),
  credit      numeric(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  ref_table   text,
  ref_id      uuid,
  ref_no      text,
  notes       text,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (debit > 0 OR credit > 0),
  CHECK (NOT (debit > 0 AND credit > 0))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.party_ledger TO authenticated;
GRANT ALL ON public.party_ledger TO service_role;
ALTER TABLE public.party_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_tenant_all ON public.party_ledger FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE INDEX idx_pl_party_date  ON public.party_ledger(tenant_id, party_type, party_id, entry_date);
CREATE INDEX idx_pl_tenant_date ON public.party_ledger(tenant_id, entry_date DESC);
CREATE INDEX idx_pl_ref         ON public.party_ledger(ref_table, ref_id);

-- =================== POST ENTRY FUNCTION ===================
CREATE OR REPLACE FUNCTION public.post_ledger_entry(
  _tenant_id  uuid,
  _party_type public.party_type,
  _party_id   uuid,
  _entry_type public.ledger_entry_type,
  _debit      numeric DEFAULT 0,
  _credit     numeric DEFAULT 0,
  _ref_table  text   DEFAULT NULL,
  _ref_id     uuid   DEFAULT NULL,
  _ref_no     text   DEFAULT NULL,
  _notes      text   DEFAULT NULL
) RETURNS public.party_ledger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE v_row public.party_ledger;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF COALESCE(_debit,0) = 0 AND COALESCE(_credit,0) = 0 THEN
    RAISE EXCEPTION 'debit and credit cannot both be zero' USING ERRCODE='22023';
  END IF;
  IF COALESCE(_debit,0) > 0 AND COALESCE(_credit,0) > 0 THEN
    RAISE EXCEPTION 'set debit OR credit, not both' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.party_ledger(
    tenant_id, party_type, party_id, entry_type, debit, credit,
    ref_table, ref_id, ref_no, notes, created_by
  ) VALUES (
    _tenant_id, _party_type, _party_id, _entry_type,
    COALESCE(_debit,0), COALESCE(_credit,0),
    _ref_table, _ref_id, _ref_no, _notes, auth.uid()
  ) RETURNING * INTO v_row;

  -- Maintain denormalised due_balance
  IF _party_type = 'customer' THEN
    UPDATE public.customers
       SET due_balance = due_balance + COALESCE(_debit,0) - COALESCE(_credit,0)
     WHERE id = _party_id AND tenant_id = _tenant_id;
  ELSE
    UPDATE public.suppliers
       SET due_balance = due_balance + COALESCE(_credit,0) - COALESCE(_debit,0)
     WHERE id = _party_id AND tenant_id = _tenant_id;
  END IF;

  RETURN v_row;
END $$;

REVOKE ALL ON FUNCTION public.post_ledger_entry(uuid,party_type,uuid,ledger_entry_type,numeric,numeric,text,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_ledger_entry(uuid,party_type,uuid,ledger_entry_type,numeric,numeric,text,uuid,text,text)
  TO authenticated, service_role;

-- =================== LEDGER VIEWS ===================
CREATE OR REPLACE VIEW public.v_customer_ledger AS
WITH entries AS (
  -- Opening balance synthetic row
  SELECT c.tenant_id, c.id AS party_id, c.name AS party_name,
         c.created_at AS entry_date, 'opening'::ledger_entry_type AS entry_type,
         GREATEST(c.opening_balance, 0) AS debit,
         GREATEST(-c.opening_balance, 0) AS credit,
         NULL::text AS ref_table, NULL::uuid AS ref_id,
         'OPENING'::text AS ref_no, NULL::text AS notes
    FROM public.customers c
   WHERE c.opening_balance <> 0
  UNION ALL
  SELECT pl.tenant_id, pl.party_id, c.name,
         pl.entry_date, pl.entry_type, pl.debit, pl.credit,
         pl.ref_table, pl.ref_id, pl.ref_no, pl.notes
    FROM public.party_ledger pl
    JOIN public.customers c ON c.id = pl.party_id AND c.tenant_id = pl.tenant_id
   WHERE pl.party_type = 'customer'
)
SELECT *,
       SUM(debit - credit) OVER (
         PARTITION BY tenant_id, party_id
         ORDER BY entry_date, ref_no
         ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
       ) AS running_balance
  FROM entries;

CREATE OR REPLACE VIEW public.v_supplier_ledger AS
WITH entries AS (
  SELECT s.tenant_id, s.id AS party_id, s.name AS party_name,
         s.created_at AS entry_date, 'opening'::ledger_entry_type AS entry_type,
         GREATEST(-s.opening_balance, 0) AS debit,
         GREATEST(s.opening_balance, 0) AS credit,
         NULL::text AS ref_table, NULL::uuid AS ref_id,
         'OPENING'::text AS ref_no, NULL::text AS notes
    FROM public.suppliers s
   WHERE s.opening_balance <> 0
  UNION ALL
  SELECT pl.tenant_id, pl.party_id, s.name,
         pl.entry_date, pl.entry_type, pl.debit, pl.credit,
         pl.ref_table, pl.ref_id, pl.ref_no, pl.notes
    FROM public.party_ledger pl
    JOIN public.suppliers s ON s.id = pl.party_id AND s.tenant_id = pl.tenant_id
   WHERE pl.party_type = 'supplier'
)
SELECT *,
       SUM(credit - debit) OVER (
         PARTITION BY tenant_id, party_id
         ORDER BY entry_date, ref_no
         ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
       ) AS running_balance
  FROM entries;

CREATE OR REPLACE VIEW public.v_outstanding_dues AS
SELECT 'customer'::party_type AS party_type,
       c.tenant_id, c.id AS party_id, c.name AS party_name,
       c.phone, c.due_balance AS balance
  FROM public.customers c
 WHERE c.is_active AND c.due_balance <> 0
UNION ALL
SELECT 'supplier'::party_type, s.tenant_id, s.id, s.name, s.phone, s.due_balance
  FROM public.suppliers s
 WHERE s.is_active AND s.due_balance <> 0;

ALTER VIEW public.v_customer_ledger  SET (security_invoker = on);
ALTER VIEW public.v_supplier_ledger  SET (security_invoker = on);
ALTER VIEW public.v_outstanding_dues SET (security_invoker = on);

GRANT SELECT ON public.v_customer_ledger, public.v_supplier_ledger, public.v_outstanding_dues
  TO authenticated, service_role;
