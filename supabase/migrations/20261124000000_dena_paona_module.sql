-- Dena-Paona (Loan & Debt Management) Module Migration
CREATE TABLE IF NOT EXISTS public.dena_paona (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
    type text NOT NULL CHECK (type IN ('give', 'take')), -- 'give' = টাকা দেওয়া, 'take' = টাকা নেওয়া
    person_name text NOT NULL,
    phone text NOT NULL,
    address text,
    transaction_date date NOT NULL DEFAULT CURRENT_DATE,
    repayment_date date,
    witness_1 text,
    witness_2 text,
    reason text,
    total_amount numeric(14, 2) NOT NULL DEFAULT 0,
    paid_amount numeric(14, 2) NOT NULL DEFAULT 0,
    remaining_amount numeric(14, 2) NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'settled', 'cancelled')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dena_paona_tenant ON public.dena_paona(tenant_id, type);
CREATE INDEX IF NOT EXISTS idx_dena_paona_person ON public.dena_paona(tenant_id, person_name);

ALTER TABLE public.dena_paona ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "dena_paona_tenant_select" ON public.dena_paona
      FOR SELECT TO authenticated
      USING (is_tenant_member(auth.uid(), tenant_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "dena_paona_tenant_insert" ON public.dena_paona
      FOR INSERT TO authenticated
      WITH CHECK (is_tenant_member(auth.uid(), tenant_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "dena_paona_tenant_update" ON public.dena_paona
      FOR UPDATE TO authenticated
      USING (is_tenant_member(auth.uid(), tenant_id))
      WITH CHECK (is_tenant_member(auth.uid(), tenant_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "dena_paona_tenant_delete" ON public.dena_paona
      FOR DELETE TO authenticated
      USING (is_tenant_member(auth.uid(), tenant_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Transaction history for each dena_paona entry
CREATE TABLE IF NOT EXISTS public.dena_paona_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    dena_paona_id uuid NOT NULL REFERENCES public.dena_paona(id) ON DELETE CASCADE,
    type text NOT NULL CHECK (type IN ('initial', 'give_more', 'take_more', 'repayment')),
    transaction_date date NOT NULL DEFAULT CURRENT_DATE,
    description text,
    given_amount numeric(14, 2) DEFAULT 0,
    taken_amount numeric(14, 2) DEFAULT 0,
    paid_amount numeric(14, 2) DEFAULT 0,
    remaining_amount numeric(14, 2) NOT NULL DEFAULT 0,
    next_payment_date date,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dena_paona_tx_parent ON public.dena_paona_transactions(dena_paona_id, transaction_date DESC);

ALTER TABLE public.dena_paona_transactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "dena_paona_tx_tenant_select" ON public.dena_paona_transactions
      FOR SELECT TO authenticated
      USING (is_tenant_member(auth.uid(), tenant_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "dena_paona_tx_tenant_insert" ON public.dena_paona_transactions
      FOR INSERT TO authenticated
      WITH CHECK (is_tenant_member(auth.uid(), tenant_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "dena_paona_tx_tenant_update" ON public.dena_paona_transactions
      FOR UPDATE TO authenticated
      USING (is_tenant_member(auth.uid(), tenant_id))
      WITH CHECK (is_tenant_member(auth.uid(), tenant_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "dena_paona_tx_tenant_delete" ON public.dena_paona_transactions
      FOR DELETE TO authenticated
      USING (is_tenant_member(auth.uid(), tenant_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT ALL ON public.dena_paona TO authenticated, service_role;
GRANT ALL ON public.dena_paona_transactions TO authenticated, service_role;
