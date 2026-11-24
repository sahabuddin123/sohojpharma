
-- E6 Supplier Ledger Hardening

-- 1) Drop synthesized opening from v_supplier_ledger so we can persist real opening rows
DROP VIEW IF EXISTS public.v_supplier_ledger CASCADE;
CREATE VIEW public.v_supplier_ledger AS
SELECT
  pl.tenant_id, pl.party_id, s.name AS party_name,
  pl.entry_date, pl.entry_type, pl.debit, pl.credit,
  pl.ref_table, pl.ref_id, pl.ref_no, pl.notes,
  SUM(pl.credit - pl.debit) OVER (
    PARTITION BY pl.tenant_id, pl.party_id
    ORDER BY pl.entry_date, pl.created_at
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS running_balance
FROM public.party_ledger pl
JOIN public.suppliers s ON s.id = pl.party_id AND s.tenant_id = pl.tenant_id
WHERE pl.party_type = 'supplier';

GRANT SELECT ON public.v_supplier_ledger TO authenticated, service_role;

-- 2) supplier_payments table
CREATE TABLE IF NOT EXISTS public.supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  purchase_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  method text NOT NULL DEFAULT 'cash',
  reference text,
  notes text,
  paid_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_payments TO authenticated;
GRANT ALL ON public.supplier_payments TO service_role;

ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members manage supplier_payments"
ON public.supplier_payments FOR ALL
TO authenticated
USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()))
WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier ON public.supplier_payments(tenant_id, supplier_id, payment_date DESC);

-- 3) AP reconciliation view: supplier ledger total due  vs  AP (2000) journal balance
CREATE OR REPLACE VIEW public.v_supplier_ap_recon AS
WITH ledger_due AS (
  SELECT tenant_id, SUM(credit - debit) AS supplier_ledger_due
  FROM public.party_ledger
  WHERE party_type = 'supplier'
  GROUP BY tenant_id
),
ap_due AS (
  SELECT je.tenant_id, SUM(jl.credit - jl.debit) AS ap_account_due
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_id
  JOIN public.chart_of_accounts c ON c.id = jl.account_id
  WHERE c.code = '2000' AND je.posted = true
  GROUP BY je.tenant_id
)
SELECT
  COALESCE(l.tenant_id, a.tenant_id) AS tenant_id,
  COALESCE(l.supplier_ledger_due, 0) AS supplier_ledger_due,
  COALESCE(a.ap_account_due, 0)     AS ap_account_due,
  COALESCE(l.supplier_ledger_due,0) - COALESCE(a.ap_account_due,0) AS variance
FROM ledger_due l
FULL OUTER JOIN ap_due a ON a.tenant_id = l.tenant_id;

GRANT SELECT ON public.v_supplier_ap_recon TO authenticated, service_role;

-- 4) Idempotent ledger posting helper for a (ref_table, ref_id, entry_type)
CREATE OR REPLACE FUNCTION public.post_supplier_ledger_idempotent(
  _tenant_id uuid,
  _supplier_id uuid,
  _entry_type ledger_entry_type,
  _debit numeric, _credit numeric,
  _ref_table text, _ref_id uuid, _ref_no text, _notes text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE existing_id uuid;
BEGIN
  IF _ref_id IS NOT NULL AND _ref_table IS NOT NULL THEN
    SELECT id INTO existing_id FROM party_ledger
     WHERE tenant_id = _tenant_id AND party_type='supplier' AND party_id = _supplier_id
       AND ref_table = _ref_table AND ref_id = _ref_id AND entry_type = _entry_type
     LIMIT 1;
    IF existing_id IS NOT NULL THEN RETURN existing_id; END IF;
  END IF;
  RETURN public.post_ledger_entry(
    _tenant_id, 'supplier'::party_type, _supplier_id, _entry_type,
    COALESCE(_debit,0), COALESCE(_credit,0), _ref_table, _ref_id, _ref_no, _notes
  );
END $$;

GRANT EXECUTE ON FUNCTION public.post_supplier_ledger_idempotent(uuid,uuid,ledger_entry_type,numeric,numeric,text,uuid,text,text) TO authenticated, service_role;

-- 5) Backfill function — opening balances + received POs + supplier_payments + supplier_returns
CREATE OR REPLACE FUNCTION public.backfill_supplier_ledger(_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_opening int := 0; v_purchase int := 0; v_payment int := 0; v_return int := 0;
  r record;
BEGIN
  -- Opening balances (one synthetic ref per supplier)
  FOR r IN SELECT id, tenant_id, opening_balance FROM suppliers
            WHERE tenant_id = _tenant_id AND COALESCE(opening_balance,0) <> 0 LOOP
    IF NOT EXISTS (
      SELECT 1 FROM party_ledger
       WHERE tenant_id = r.tenant_id AND party_type='supplier' AND party_id = r.id
         AND entry_type = 'opening'
    ) THEN
      PERFORM post_ledger_entry(
        r.tenant_id, 'supplier'::party_type, r.id, 'opening'::ledger_entry_type,
        GREATEST(-r.opening_balance, 0), GREATEST(r.opening_balance, 0),
        NULL, NULL, 'OPENING', 'Opening balance'
      );
      v_opening := v_opening + 1;
    END IF;
  END LOOP;

  -- Purchases: every received / partially_received PO with supplier_id and total > 0
  FOR r IN SELECT id, tenant_id, supplier_id, po_number, total
             FROM purchase_orders
            WHERE tenant_id = _tenant_id AND supplier_id IS NOT NULL
              AND status IN ('received','partially_received')
              AND COALESCE(total,0) > 0 LOOP
    PERFORM post_supplier_ledger_idempotent(
      r.tenant_id, r.supplier_id, 'purchase'::ledger_entry_type,
      0, r.total, 'purchase_orders', r.id, r.po_number, 'Auto-posted purchase'
    );
    v_purchase := v_purchase + 1;
  END LOOP;

  -- Payments
  FOR r IN SELECT id, tenant_id, supplier_id, amount, reference
             FROM supplier_payments WHERE tenant_id = _tenant_id LOOP
    PERFORM post_supplier_ledger_idempotent(
      r.tenant_id, r.supplier_id, 'payment'::ledger_entry_type,
      r.amount, 0, 'supplier_payments', r.id, r.reference, 'Auto-posted payment'
    );
    v_payment := v_payment + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'opening', v_opening, 'purchase', v_purchase,
    'payment', v_payment, 'return', v_return
  );
END $$;

GRANT EXECUTE ON FUNCTION public.backfill_supplier_ledger(uuid) TO authenticated, service_role;
