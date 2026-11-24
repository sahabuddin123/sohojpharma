
-- =========================================================
-- SaaS Billing Engine
-- =========================================================

-- ---------- subscription_invoices ----------
CREATE TABLE IF NOT EXISTS public.subscription_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no text NOT NULL UNIQUE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  plan_name text NOT NULL,
  billing_cycle text NOT NULL DEFAULT 'monthly',
  duration_days integer NOT NULL DEFAULT 30,
  period_start timestamptz,
  period_end   timestamptz,
  kind text NOT NULL DEFAULT 'new'
    CHECK (kind IN ('new','renewal','upgrade','downgrade','manual','adjustment')),
  amount        numeric(14,2) NOT NULL DEFAULT 0,
  discount      numeric(14,2) NOT NULL DEFAULT 0,
  vat_percent   numeric(6,3)  NOT NULL DEFAULT 0,
  vat           numeric(14,2) NOT NULL DEFAULT 0,
  grand_total   numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'BDT',
  status text NOT NULL DEFAULT 'unpaid'
    CHECK (status IN ('draft','unpaid','paid','overdue','cancelled','refunded')),
  payment_id uuid REFERENCES public.subscription_payments(id) ON DELETE SET NULL,
  paid_at timestamptz,
  due_at timestamptz,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_invoices TO authenticated;
GRANT ALL ON public.subscription_invoices TO service_role;

ALTER TABLE public.subscription_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subinv: admins all"
  ON public.subscription_invoices FOR ALL TO authenticated
  USING (public.is_app_admin(auth.uid()))
  WITH CHECK (public.is_app_admin(auth.uid()));

CREATE POLICY "subinv: tenant members view own"
  ON public.subscription_invoices FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = subscription_invoices.tenant_id
      AND tm.user_id = auth.uid()
  ));

CREATE INDEX IF NOT EXISTS idx_subinv_tenant       ON public.subscription_invoices(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subinv_subscription ON public.subscription_invoices(subscription_id);
CREATE INDEX IF NOT EXISTS idx_subinv_status       ON public.subscription_invoices(status);
CREATE INDEX IF NOT EXISTS idx_subinv_due          ON public.subscription_invoices(due_at) WHERE status IN ('unpaid','overdue');

-- ---------- subscription_invoice_items ----------
CREATE TABLE IF NOT EXISTS public.subscription_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.subscription_invoices(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric(14,2) NOT NULL DEFAULT 1,
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_invoice_items TO authenticated;
GRANT ALL ON public.subscription_invoice_items TO service_role;

ALTER TABLE public.subscription_invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subinv_items: admins all"
  ON public.subscription_invoice_items FOR ALL TO authenticated
  USING (public.is_app_admin(auth.uid()))
  WITH CHECK (public.is_app_admin(auth.uid()));

CREATE POLICY "subinv_items: tenant members view own"
  ON public.subscription_invoice_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.subscription_invoices i
    JOIN public.tenant_members tm ON tm.tenant_id = i.tenant_id
    WHERE i.id = subscription_invoice_items.invoice_id
      AND tm.user_id = auth.uid()
  ));

CREATE INDEX IF NOT EXISTS idx_subinv_items_invoice ON public.subscription_invoice_items(invoice_id);

-- ---------- updated_at trigger reuse ----------
CREATE OR REPLACE FUNCTION public.tg_subinv_touch() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_subinv_touch ON public.subscription_invoices;
CREATE TRIGGER trg_subinv_touch BEFORE UPDATE ON public.subscription_invoices
  FOR EACH ROW EXECUTE FUNCTION public.tg_subinv_touch();

-- ---------- (method, transaction_id) uniqueness ----------
CREATE UNIQUE INDEX IF NOT EXISTS subscription_payments_method_txn_uniq
  ON public.subscription_payments (method, transaction_id)
  WHERE transaction_id IS NOT NULL AND length(trim(transaction_id)) > 0;

-- ---------- invoice no generator ----------
CREATE SEQUENCE IF NOT EXISTS public.subscription_invoice_no_seq START 1000;

CREATE OR REPLACE FUNCTION public.next_subscription_invoice_no()
RETURNS text LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_no bigint;
BEGIN
  v_no := nextval('public.subscription_invoice_no_seq');
  RETURN 'SUB-' || to_char(now(),'YYYYMM') || '-' || lpad(v_no::text, 6, '0');
END $$;

-- ---------- core creator ----------
CREATE OR REPLACE FUNCTION public.create_subscription_invoice(
  p_subscription_id uuid,
  p_kind text DEFAULT 'new',
  p_amount numeric DEFAULT NULL,
  p_discount numeric DEFAULT 0,
  p_vat_percent numeric DEFAULT 0,
  p_payment_id uuid DEFAULT NULL,
  p_status text DEFAULT 'unpaid',
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s record;
  p record;
  v_amount numeric;
  v_vat numeric;
  v_total numeric;
  v_duration int;
  v_id uuid;
  v_no text;
BEGIN
  SELECT * INTO s FROM public.subscriptions WHERE id = p_subscription_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription % not found', p_subscription_id; END IF;

  SELECT * INTO p FROM public.plans WHERE id = s.plan_id;

  v_amount := COALESCE(p_amount, CASE
      WHEN s.billing_cycle = 'yearly' THEN COALESCE(p.price_yearly_bdt, p.price_bdt * 12)
      ELSE p.price_bdt
    END, 0);

  v_duration := CASE s.billing_cycle
      WHEN 'monthly' THEN 30
      WHEN 'quarterly' THEN 90
      WHEN 'half_yearly' THEN 180
      WHEN 'yearly' THEN 365
      WHEN 'lifetime' THEN 36500
      ELSE 30
    END;

  v_vat := round((GREATEST(v_amount - COALESCE(p_discount,0), 0) * COALESCE(p_vat_percent,0) / 100)::numeric, 2);
  v_total := round((v_amount - COALESCE(p_discount,0) + v_vat)::numeric, 2);
  v_no := public.next_subscription_invoice_no();

  INSERT INTO public.subscription_invoices (
    invoice_no, tenant_id, subscription_id, plan_id, plan_name,
    billing_cycle, duration_days, period_start, period_end,
    kind, amount, discount, vat_percent, vat, grand_total,
    status, payment_id, due_at, notes, paid_at
  ) VALUES (
    v_no, s.tenant_id, s.id, s.plan_id, COALESCE(p.name,'Plan'),
    s.billing_cycle, v_duration, s.current_period_start, s.current_period_end,
    p_kind, v_amount, COALESCE(p_discount,0), COALESCE(p_vat_percent,0), v_vat, v_total,
    p_status, p_payment_id, COALESCE(s.current_period_end, now() + (v_duration || ' days')::interval), p_notes,
    CASE WHEN p_status = 'paid' THEN now() ELSE NULL END
  ) RETURNING id INTO v_id;

  INSERT INTO public.subscription_invoice_items (invoice_id, description, quantity, unit_price, amount)
  VALUES (v_id, COALESCE(p.name,'Plan') || ' (' || s.billing_cycle || ')', 1, v_amount, v_amount);

  IF COALESCE(p_discount,0) > 0 THEN
    INSERT INTO public.subscription_invoice_items (invoice_id, description, quantity, unit_price, amount)
    VALUES (v_id, 'Discount', 1, -p_discount, -p_discount);
  END IF;
  IF v_vat > 0 THEN
    INSERT INTO public.subscription_invoice_items (invoice_id, description, quantity, unit_price, amount)
    VALUES (v_id, 'VAT (' || p_vat_percent || '%)', 1, v_vat, v_vat);
  END IF;

  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.create_subscription_invoice(uuid,text,numeric,numeric,numeric,uuid,text,text) TO authenticated, service_role;

-- ---------- trigger: subscription created/renewed/upgraded ----------
CREATE OR REPLACE FUNCTION public.tg_subscription_autoinvoice() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_kind text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN ('active','trial') THEN
      PERFORM public.create_subscription_invoice(NEW.id, 'new');
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Renewal: period end moved forward
    IF NEW.current_period_end IS DISTINCT FROM OLD.current_period_end
       AND NEW.current_period_end > COALESCE(OLD.current_period_end, 'epoch'::timestamptz) THEN
      v_kind := 'renewal';
    END IF;
    -- Plan change
    IF NEW.plan_id IS DISTINCT FROM OLD.plan_id THEN
      v_kind := CASE WHEN v_kind IS NULL THEN 'upgrade' ELSE v_kind END;
    END IF;
    IF v_kind IS NOT NULL THEN
      PERFORM public.create_subscription_invoice(NEW.id, v_kind);
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_subscription_autoinvoice ON public.subscriptions;
CREATE TRIGGER trg_subscription_autoinvoice
  AFTER INSERT OR UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.tg_subscription_autoinvoice();

-- ---------- trigger: payment approved → mark invoice paid ----------
CREATE OR REPLACE FUNCTION public.tg_subpayment_invoice_link() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    UPDATE public.subscription_invoices
       SET status = 'paid', paid_at = now(), payment_id = NEW.id
     WHERE subscription_id = NEW.subscription_id
       AND status IN ('unpaid','overdue','draft')
       AND (payment_id IS NULL OR payment_id = NEW.id);
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'refunded' AND OLD.status IS DISTINCT FROM 'refunded' THEN
    UPDATE public.subscription_invoices
       SET status = 'refunded'
     WHERE payment_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_subpayment_invoice_link ON public.subscription_payments;
CREATE TRIGGER trg_subpayment_invoice_link
  AFTER UPDATE ON public.subscription_payments
  FOR EACH ROW EXECUTE FUNCTION public.tg_subpayment_invoice_link();

-- ---------- mark overdue helper (callable by cron) ----------
CREATE OR REPLACE FUNCTION public.mark_subscription_invoices_overdue()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.subscription_invoices
     SET status = 'overdue'
   WHERE status = 'unpaid' AND due_at IS NOT NULL AND due_at < now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

GRANT EXECUTE ON FUNCTION public.mark_subscription_invoices_overdue() TO authenticated, service_role;

-- ---------- admin manual charge ----------
CREATE OR REPLACE FUNCTION public.admin_create_manual_invoice(
  p_subscription_id uuid,
  p_amount numeric,
  p_discount numeric DEFAULT 0,
  p_vat_percent numeric DEFAULT 0,
  p_notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_app_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  v_id := public.create_subscription_invoice(p_subscription_id, 'manual', p_amount, p_discount, p_vat_percent, NULL, 'unpaid', p_notes);
  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_create_manual_invoice(uuid,numeric,numeric,numeric,text) TO authenticated;
