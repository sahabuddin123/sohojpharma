
-- ============================================================
-- Slice A: Finance schema (double-entry) + audit attach
-- ============================================================

-- 1) Account type enum
DO $$ BEGIN
  CREATE TYPE public.account_type AS ENUM ('asset','liability','equity','income','expense','cogs');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.fin_payment_method AS ENUM ('cash','bank','bkash','nagad','rocket','card','cheque','adjustment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) chart_of_accounts
CREATE TABLE IF NOT EXISTS public.chart_of_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  type public.account_type NOT NULL,
  parent_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chart_of_accounts TO authenticated;
GRANT ALL ON public.chart_of_accounts TO service_role;
ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coa_tenant_select" ON public.chart_of_accounts FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "coa_tenant_write" ON public.chart_of_accounts FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE TRIGGER trg_coa_updated BEFORE UPDATE ON public.chart_of_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS idx_coa_tenant_type ON public.chart_of_accounts(tenant_id, type);

-- 3) journal_entries
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entry_no text NOT NULL,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  ref_table text,
  ref_id uuid,
  ref_no text,
  notes text,
  total_debit numeric(14,4) NOT NULL DEFAULT 0,
  total_credit numeric(14,4) NOT NULL DEFAULT 0,
  posted_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, entry_no)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_entries TO authenticated;
GRANT ALL ON public.journal_entries TO service_role;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "je_tenant_select" ON public.journal_entries FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "je_tenant_write" ON public.journal_entries FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE TRIGGER trg_je_updated BEFORE UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS idx_je_tenant_date ON public.journal_entries(tenant_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_je_ref ON public.journal_entries(ref_table, ref_id);

-- 4) journal_lines
CREATE TABLE IF NOT EXISTS public.journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  journal_id uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  debit numeric(14,4) NOT NULL DEFAULT 0,
  credit numeric(14,4) NOT NULL DEFAULT 0,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (debit >= 0 AND credit >= 0),
  CHECK (NOT (debit > 0 AND credit > 0))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_lines TO authenticated;
GRANT ALL ON public.journal_lines TO service_role;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jl_tenant_select" ON public.journal_lines FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "jl_tenant_write" ON public.journal_lines FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE INDEX IF NOT EXISTS idx_jl_journal ON public.journal_lines(journal_id);
CREATE INDEX IF NOT EXISTS idx_jl_account ON public.journal_lines(account_id);

-- 5) expenses
CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  expense_no text NOT NULL,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  account_id uuid NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  amount numeric(14,4) NOT NULL CHECK (amount > 0),
  payment_method public.fin_payment_method NOT NULL DEFAULT 'cash',
  vendor text,
  reference_no text,
  notes text,
  journal_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, expense_no)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exp_tenant_select" ON public.expenses FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "exp_tenant_write" ON public.expenses FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE TRIGGER trg_exp_updated BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS idx_exp_tenant_date ON public.expenses(tenant_id, expense_date DESC);

-- 6) incomes
CREATE TABLE IF NOT EXISTS public.incomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  income_no text NOT NULL,
  income_date date NOT NULL DEFAULT CURRENT_DATE,
  account_id uuid NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  amount numeric(14,4) NOT NULL CHECK (amount > 0),
  payment_method public.fin_payment_method NOT NULL DEFAULT 'cash',
  source text,
  reference_no text,
  notes text,
  journal_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, income_no)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.incomes TO authenticated;
GRANT ALL ON public.incomes TO service_role;
ALTER TABLE public.incomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inc_tenant_select" ON public.incomes FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "inc_tenant_write" ON public.incomes FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE TRIGGER trg_inc_updated BEFORE UPDATE ON public.incomes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS idx_inc_tenant_date ON public.incomes(tenant_id, income_date DESC);

-- 7) Balanced-entry trigger (deferred, checked at row commit)
CREATE OR REPLACE FUNCTION public.journal_assert_balanced()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_d numeric; v_c numeric;
BEGIN
  SELECT COALESCE(sum(debit),0), COALESCE(sum(credit),0)
    INTO v_d, v_c
    FROM public.journal_lines WHERE journal_id = NEW.id;
  IF round(v_d,4) <> round(v_c,4) THEN
    RAISE EXCEPTION 'journal % is unbalanced: debit=% credit=%', NEW.entry_no, v_d, v_c
      USING ERRCODE='22023';
  END IF;
  UPDATE public.journal_entries SET total_debit=v_d, total_credit=v_c WHERE id=NEW.id;
  RETURN NEW;
END $$;

CREATE CONSTRAINT TRIGGER trg_je_balanced
  AFTER INSERT OR UPDATE ON public.journal_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.journal_assert_balanced();

-- 8) post_journal RPC: insert header + lines atomically
CREATE OR REPLACE FUNCTION public.post_journal(
  _tenant_id uuid,
  _entry_no text,
  _entry_date date,
  _notes text,
  _ref_table text,
  _ref_id uuid,
  _ref_no text,
  _lines jsonb -- [{account_code, debit, credit, description}]
) RETURNS public.journal_entries
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_je public.journal_entries;
  v_line jsonb;
  v_acc uuid;
  v_d numeric; v_c numeric;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF jsonb_array_length(_lines) < 2 THEN
    RAISE EXCEPTION 'journal needs at least 2 lines' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.journal_entries(
    tenant_id, entry_no, entry_date, notes, ref_table, ref_id, ref_no, posted_by
  ) VALUES (
    _tenant_id, _entry_no, COALESCE(_entry_date, CURRENT_DATE), _notes,
    _ref_table, _ref_id, _ref_no, auth.uid()
  ) RETURNING * INTO v_je;

  FOR v_line IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    SELECT id INTO v_acc FROM public.chart_of_accounts
      WHERE tenant_id = _tenant_id AND code = v_line->>'account_code' AND is_active;
    IF v_acc IS NULL THEN
      RAISE EXCEPTION 'unknown account code: %', v_line->>'account_code' USING ERRCODE='23503';
    END IF;
    v_d := COALESCE((v_line->>'debit')::numeric, 0);
    v_c := COALESCE((v_line->>'credit')::numeric, 0);
    INSERT INTO public.journal_lines(tenant_id, journal_id, account_id, debit, credit, description)
      VALUES (_tenant_id, v_je.id, v_acc, v_d, v_c, v_line->>'description');
  END LOOP;

  -- Deferred trigger will validate balance at commit.
  RETURN v_je;
END $$;

REVOKE ALL ON FUNCTION public.post_journal(uuid,text,date,text,text,uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_journal(uuid,text,date,text,text,uuid,text,jsonb) TO authenticated;

-- 9) Seed default chart of accounts for a tenant
CREATE OR REPLACE FUNCTION public.seed_default_chart(_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.chart_of_accounts(tenant_id, code, name, type, is_system) VALUES
    (_tenant_id,'1000','Cash on Hand','asset',true),
    (_tenant_id,'1010','Bank Account','asset',true),
    (_tenant_id,'1020','bKash','asset',true),
    (_tenant_id,'1030','Nagad','asset',true),
    (_tenant_id,'1100','Accounts Receivable','asset',true),
    (_tenant_id,'1200','Inventory','asset',true),
    (_tenant_id,'2000','Accounts Payable','liability',true),
    (_tenant_id,'2100','Output VAT Payable','liability',true),
    (_tenant_id,'2200','Input VAT Receivable','asset',true),
    (_tenant_id,'3000','Owner Equity','equity',true),
    (_tenant_id,'4000','Sales Revenue','income',true),
    (_tenant_id,'4100','Other Income','income',true),
    (_tenant_id,'5000','Cost of Goods Sold','cogs',true),
    (_tenant_id,'6000','Salary Expense','expense',true),
    (_tenant_id,'6100','Rent Expense','expense',true),
    (_tenant_id,'6200','Utilities Expense','expense',true),
    (_tenant_id,'6300','Marketing Expense','expense',true),
    (_tenant_id,'6900','Miscellaneous Expense','expense',true)
  ON CONFLICT (tenant_id, code) DO NOTHING;
END $$;

REVOKE ALL ON FUNCTION public.seed_default_chart(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_default_chart(uuid) TO authenticated, service_role;

-- Backfill existing tenants
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id FROM public.tenants LOOP
    PERFORM public.seed_default_chart(r.id);
  END LOOP;
END $$;

-- Extend handle_new_user to seed chart for new tenants
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_tenant_id uuid;
  tenant_slug text;
  pharmacy_name text;
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)));

  pharmacy_name := COALESCE(NEW.raw_user_meta_data->>'pharmacy_name',
                            split_part(NEW.email, '@', 1) || '''s Pharmacy');
  tenant_slug := lower(regexp_replace(pharmacy_name, '[^a-zA-Z0-9]+', '-', 'g'))
                 || '-' || substr(NEW.id::text, 1, 8);

  INSERT INTO public.tenants (name, slug) VALUES (pharmacy_name, tenant_slug)
  RETURNING id INTO new_tenant_id;

  INSERT INTO public.tenant_members (tenant_id, user_id, is_default)
  VALUES (new_tenant_id, NEW.id, true);

  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (NEW.id, new_tenant_id, 'owner');

  PERFORM public.seed_default_chart(new_tenant_id);

  RETURN NEW;
END $$;

-- 10) Attach audit_row_change to write-heavy tables (idempotent)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'products','sales','sale_items','sale_payments',
    'purchase_orders','purchase_order_items',
    'goods_receipts','goods_receipt_items',
    'batches','customers','suppliers',
    'party_ledger','customer_payments',
    'journal_entries','journal_lines','expenses','incomes',
    'chart_of_accounts','stock_movements','prescriptions'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%I ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.audit_row_change()', t, t);
  END LOOP;
END $$;
