
-- Phase 4: Cash Register / Shift Management

CREATE TYPE public.cash_register_status AS ENUM ('open','closed');

CREATE TYPE public.cash_txn_type AS ENUM (
  'opening_balance','closing_balance',
  'sale','sale_refund',
  'due_collection','customer_payment','supplier_payment',
  'cash_in','cash_out','expense'
);

-- ============================================================
-- cash_registers
-- ============================================================
CREATE TABLE public.cash_registers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  register_name text NOT NULL,
  opening_amount numeric(14,2) NOT NULL DEFAULT 0,
  expected_closing_amount numeric(14,2),
  actual_closing_amount numeric(14,2),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  status public.cash_register_status NOT NULL DEFAULT 'open',
  notes text,
  closing_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_registers TO authenticated;
GRANT ALL ON public.cash_registers TO service_role;

ALTER TABLE public.cash_registers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read registers"
  ON public.cash_registers FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)
         AND public.user_can_access_branch(tenant_id, branch_id));

CREATE POLICY "cashier opens own register"
  ON public.cash_registers FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id)
              AND user_id = auth.uid()
              AND public.user_can_access_branch(tenant_id, branch_id));

CREATE POLICY "cashier updates own / admin updates any"
  ON public.cash_registers FOR UPDATE TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)
         AND (user_id = auth.uid() OR public.is_branch_admin(auth.uid(), tenant_id)))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "admins delete registers"
  ON public.cash_registers FOR DELETE TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)
         AND public.is_branch_admin(auth.uid(), tenant_id));

-- Only one OPEN register per (tenant,user)
CREATE UNIQUE INDEX cash_registers_one_open_per_user
  ON public.cash_registers(tenant_id, user_id)
  WHERE status = 'open';

CREATE INDEX cash_registers_branch_idx ON public.cash_registers(tenant_id, branch_id, opened_at DESC);
CREATE INDEX cash_registers_status_idx ON public.cash_registers(tenant_id, status);

CREATE TRIGGER cash_registers_updated_at
  BEFORE UPDATE ON public.cash_registers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- cash_register_transactions
-- ============================================================
CREATE TABLE public.cash_register_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  register_id uuid NOT NULL REFERENCES public.cash_registers(id) ON DELETE CASCADE,
  transaction_type public.cash_txn_type NOT NULL,
  reference_table text,
  reference_id uuid,
  reference_no text,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  payment_method text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_register_transactions TO authenticated;
GRANT ALL ON public.cash_register_transactions TO service_role;

ALTER TABLE public.cash_register_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members read register txns"
  ON public.cash_register_transactions FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "tenant members create register txns"
  ON public.cash_register_transactions FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "admins update register txns"
  ON public.cash_register_transactions FOR UPDATE TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)
         AND public.is_branch_admin(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "admins delete register txns"
  ON public.cash_register_transactions FOR DELETE TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)
         AND public.is_branch_admin(auth.uid(), tenant_id));

CREATE INDEX cash_register_txns_register_idx
  ON public.cash_register_transactions(register_id, created_at);
CREATE INDEX cash_register_txns_tenant_idx
  ON public.cash_register_transactions(tenant_id, created_at DESC);

-- ============================================================
-- RPC: open_cash_register
-- ============================================================
CREATE OR REPLACE FUNCTION public.open_cash_register(
  _tenant_id uuid,
  _branch_id uuid,
  _register_name text,
  _opening_amount numeric,
  _notes text DEFAULT NULL
) RETURNS public.cash_registers
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_reg public.cash_registers;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF _opening_amount IS NULL OR _opening_amount < 0 THEN
    RAISE EXCEPTION 'opening_amount must be >= 0' USING ERRCODE='22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cash_registers
              WHERE tenant_id = _tenant_id AND user_id = auth.uid()
                AND status = 'open') THEN
    RAISE EXCEPTION 'an open register already exists for this user' USING ERRCODE='23505';
  END IF;

  INSERT INTO public.cash_registers(
    tenant_id, branch_id, user_id, register_name,
    opening_amount, status, notes
  ) VALUES (
    _tenant_id, _branch_id, auth.uid(),
    COALESCE(NULLIF(_register_name,''), 'Register ' || to_char(now(),'YYYY-MM-DD HH24:MI')),
    _opening_amount, 'open', _notes
  ) RETURNING * INTO v_reg;

  INSERT INTO public.cash_register_transactions(
    tenant_id, register_id, transaction_type, amount,
    payment_method, notes, created_by
  ) VALUES (
    _tenant_id, v_reg.id, 'opening_balance', _opening_amount,
    'cash', 'Opening balance', auth.uid()
  );

  PERFORM public.audit_log_event(
    _tenant_id, 'register.opened', 'cash_registers', v_reg.id, NULL,
    jsonb_build_object('register_name', v_reg.register_name,
                       'opening_amount', _opening_amount,
                       'branch_id', _branch_id)
  );
  RETURN v_reg;
END $$;

-- ============================================================
-- RPC: record_cash_txn (generic cash_in/cash_out/expense + linked refs)
-- ============================================================
CREATE OR REPLACE FUNCTION public.record_cash_txn(
  _tenant_id uuid,
  _register_id uuid,
  _type public.cash_txn_type,
  _amount numeric,
  _payment_method text DEFAULT 'cash',
  _notes text DEFAULT NULL,
  _reference_table text DEFAULT NULL,
  _reference_id uuid DEFAULT NULL,
  _reference_no text DEFAULT NULL
) RETURNS public.cash_register_transactions
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_reg public.cash_registers;
  v_txn public.cash_register_transactions;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_reg FROM public.cash_registers
    WHERE id = _register_id AND tenant_id = _tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'register not found' USING ERRCODE='23503'; END IF;
  IF v_reg.status <> 'open' THEN
    RAISE EXCEPTION 'register is closed' USING ERRCODE='22023';
  END IF;
  IF _amount IS NULL OR _amount < 0 THEN
    RAISE EXCEPTION 'amount must be >= 0' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.cash_register_transactions(
    tenant_id, register_id, transaction_type, amount,
    payment_method, notes, reference_table, reference_id, reference_no, created_by
  ) VALUES (
    _tenant_id, _register_id, _type, _amount,
    COALESCE(_payment_method,'cash'), _notes,
    _reference_table, _reference_id, _reference_no, auth.uid()
  ) RETURNING * INTO v_txn;

  IF _type IN ('cash_in','cash_out','expense') THEN
    PERFORM public.audit_log_event(
      _tenant_id,
      CASE _type WHEN 'cash_in' THEN 'cash.in'
                 WHEN 'cash_out' THEN 'cash.out'
                 ELSE 'expense.created' END,
      'cash_register_transactions', v_txn.id, NULL,
      jsonb_build_object('amount', _amount, 'method', _payment_method, 'notes', _notes)
    );
  END IF;
  RETURN v_txn;
END $$;

-- ============================================================
-- RPC: register_summary
-- ============================================================
CREATE OR REPLACE FUNCTION public.cash_register_summary(_register_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  v_reg public.cash_registers;
  v jsonb;
BEGIN
  SELECT * INTO v_reg FROM public.cash_registers WHERE id = _register_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'register not found'; END IF;
  IF NOT public.is_tenant_member(auth.uid(), v_reg.tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  WITH t AS (
    SELECT transaction_type, COALESCE(LOWER(payment_method),'cash') AS pm, amount
      FROM public.cash_register_transactions WHERE register_id = _register_id
  )
  SELECT jsonb_build_object(
    'register', to_jsonb(v_reg),
    'opening_cash', v_reg.opening_amount,
    'cash_sales',   COALESCE((SELECT SUM(amount) FROM t WHERE transaction_type='sale' AND pm='cash'),0),
    'card_sales',   COALESCE((SELECT SUM(amount) FROM t WHERE transaction_type='sale' AND pm='card'),0),
    'bkash_sales',  COALESCE((SELECT SUM(amount) FROM t WHERE transaction_type='sale' AND pm='bkash'),0),
    'nagad_sales',  COALESCE((SELECT SUM(amount) FROM t WHERE transaction_type='sale' AND pm='nagad'),0),
    'rocket_sales', COALESCE((SELECT SUM(amount) FROM t WHERE transaction_type='sale' AND pm='rocket'),0),
    'bank_sales',   COALESCE((SELECT SUM(amount) FROM t WHERE transaction_type='sale' AND pm='bank'),0),
    'refunds_cash', COALESCE((SELECT SUM(amount) FROM t WHERE transaction_type='sale_refund' AND pm='cash'),0),
    'refunds_total',COALESCE((SELECT SUM(amount) FROM t WHERE transaction_type='sale_refund'),0),
    'due_collection_cash', COALESCE((SELECT SUM(amount) FROM t WHERE transaction_type IN ('due_collection','customer_payment') AND pm='cash'),0),
    'supplier_payment_cash', COALESCE((SELECT SUM(amount) FROM t WHERE transaction_type='supplier_payment' AND pm='cash'),0),
    'expenses_cash', COALESCE((SELECT SUM(amount) FROM t WHERE transaction_type='expense' AND pm='cash'),0),
    'cash_in',  COALESCE((SELECT SUM(amount) FROM t WHERE transaction_type='cash_in'),0),
    'cash_out', COALESCE((SELECT SUM(amount) FROM t WHERE transaction_type='cash_out'),0)
  ) INTO v;

  v := v || jsonb_build_object(
    'expected_cash',
      (v->>'opening_cash')::numeric
      + (v->>'cash_sales')::numeric
      + (v->>'due_collection_cash')::numeric
      + (v->>'cash_in')::numeric
      - (v->>'refunds_cash')::numeric
      - (v->>'supplier_payment_cash')::numeric
      - (v->>'expenses_cash')::numeric
      - (v->>'cash_out')::numeric
  );
  RETURN v;
END $$;

-- ============================================================
-- RPC: close_cash_register
-- ============================================================
CREATE OR REPLACE FUNCTION public.close_cash_register(
  _register_id uuid,
  _actual_cash numeric,
  _notes text DEFAULT NULL
) RETURNS public.cash_registers
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_reg public.cash_registers;
  v_sum jsonb;
  v_expected numeric;
BEGIN
  SELECT * INTO v_reg FROM public.cash_registers WHERE id = _register_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'register not found' USING ERRCODE='23503'; END IF;
  IF NOT public.is_tenant_member(auth.uid(), v_reg.tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF v_reg.user_id <> auth.uid()
     AND NOT public.is_branch_admin(auth.uid(), v_reg.tenant_id) THEN
    RAISE EXCEPTION 'only owner or admin can close this register' USING ERRCODE='42501';
  END IF;
  IF v_reg.status = 'closed' THEN
    RAISE EXCEPTION 'register already closed' USING ERRCODE='22023';
  END IF;
  IF _actual_cash IS NULL OR _actual_cash < 0 THEN
    RAISE EXCEPTION 'actual_cash must be >= 0' USING ERRCODE='22023';
  END IF;

  v_sum := public.cash_register_summary(_register_id);
  v_expected := (v_sum->>'expected_cash')::numeric;

  UPDATE public.cash_registers
     SET status='closed', closed_at=now(),
         expected_closing_amount = v_expected,
         actual_closing_amount = _actual_cash,
         closing_notes = _notes
   WHERE id = _register_id RETURNING * INTO v_reg;

  INSERT INTO public.cash_register_transactions(
    tenant_id, register_id, transaction_type, amount,
    payment_method, notes, created_by
  ) VALUES (
    v_reg.tenant_id, _register_id, 'closing_balance', _actual_cash,
    'cash',
    'Closing — expected ' || v_expected::text || ', actual ' || _actual_cash::text
      || COALESCE(' — '||_notes,''),
    auth.uid()
  );

  PERFORM public.audit_log_event(
    v_reg.tenant_id, 'register.closed', 'cash_registers', v_reg.id, NULL,
    jsonb_build_object('expected', v_expected, 'actual', _actual_cash,
                       'difference', _actual_cash - v_expected)
  );
  RETURN v_reg;
END $$;
