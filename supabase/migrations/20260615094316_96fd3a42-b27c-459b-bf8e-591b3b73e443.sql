
-- ============================================================
-- Slice B: Subscription + Returns + Clinical + Loyalty
-- ============================================================

-- 1) plans (global read)
CREATE TABLE IF NOT EXISTS public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  max_products integer,           -- NULL = unlimited
  max_users integer,              -- NULL = unlimited
  max_branches integer,
  price_bdt numeric(12,2) NOT NULL DEFAULT 0,
  billing_interval text NOT NULL DEFAULT 'monthly' CHECK (billing_interval IN ('monthly','yearly','lifetime')),
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plans TO anon, authenticated;
GRANT ALL ON public.plans TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans_public_read" ON public.plans FOR SELECT TO anon, authenticated USING (true);
CREATE TRIGGER trg_plans_updated BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.plans(code,name,max_products,max_users,max_branches,price_bdt,billing_interval,features,sort_order) VALUES
  ('free','Free',200,1,1,0,'monthly','{"reports":false,"api":false,"offline":false}'::jsonb,1),
  ('starter','Starter',5000,3,1,990,'monthly','{"reports":true,"api":false,"offline":true}'::jsonb,2),
  ('pro','Professional',NULL,10,3,2990,'monthly','{"reports":true,"api":true,"offline":true,"ai":true}'::jsonb,3),
  ('enterprise','Enterprise',NULL,NULL,NULL,9990,'monthly','{"reports":true,"api":true,"offline":true,"ai":true,"sso":true}'::jsonb,4)
ON CONFLICT (code) DO NOTHING;

-- 2) subscriptions
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('trialing','active','past_due','cancelled','expired')),
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  cancelled_at timestamptz,
  external_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subs_tenant_select" ON public.subscriptions FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "subs_owner_write" ON public.subscriptions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), tenant_id, 'owner'))
  WITH CHECK (public.has_role(auth.uid(), tenant_id, 'owner'));
CREATE TRIGGER trg_subs_updated BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS idx_subs_status ON public.subscriptions(status, current_period_end);

-- Backfill: every tenant gets a free subscription if none
INSERT INTO public.subscriptions(tenant_id, plan_id, status)
SELECT t.id, p.id, 'active'
  FROM public.tenants t
  CROSS JOIN public.plans p
 WHERE p.code = 'free'
   AND NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.tenant_id = t.id);

-- 3) usage_metering
CREATE TABLE IF NOT EXISTS public.usage_metering (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  metric text NOT NULL,
  value numeric NOT NULL DEFAULT 0,
  period_start date NOT NULL,
  period_end date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, metric, period_start)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.usage_metering TO authenticated;
GRANT ALL ON public.usage_metering TO service_role;
ALTER TABLE public.usage_metering ENABLE ROW LEVEL SECURITY;
CREATE POLICY "usage_tenant_select" ON public.usage_metering FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "usage_tenant_write" ON public.usage_metering FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE TRIGGER trg_usage_updated BEFORE UPDATE ON public.usage_metering
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) Rewrite plan_limits to read from plans table.
--    Existing function returns by tenant_plan enum (free/starter/pro/enterprise),
--    so we look up by name match.
CREATE OR REPLACE FUNCTION public.plan_limits(_plan tenant_plan)
RETURNS TABLE(max_products integer, max_users integer)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT p.max_products, p.max_users
    FROM public.plans p
   WHERE p.code = _plan::text
   LIMIT 1;
$$;

-- 5) Sales returns
CREATE TABLE IF NOT EXISTS public.sales_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  return_no text NOT NULL,
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  return_date date NOT NULL DEFAULT CURRENT_DATE,
  reason text,
  subtotal numeric(14,4) NOT NULL DEFAULT 0,
  vat numeric(14,4) NOT NULL DEFAULT 0,
  total numeric(14,4) NOT NULL DEFAULT 0,
  refund_method public.payment_method NOT NULL DEFAULT 'cash',
  refunded_amount numeric(14,4) NOT NULL DEFAULT 0,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, return_no)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_returns TO authenticated;
GRANT ALL ON public.sales_returns TO service_role;
ALTER TABLE public.sales_returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sr_tenant_select" ON public.sales_returns FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "sr_tenant_write" ON public.sales_returns FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE TRIGGER trg_sr_updated BEFORE UPDATE ON public.sales_returns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS idx_sr_tenant_date ON public.sales_returns(tenant_id, return_date DESC);

CREATE TABLE IF NOT EXISTS public.sale_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  return_id uuid NOT NULL REFERENCES public.sales_returns(id) ON DELETE CASCADE,
  sale_item_id uuid REFERENCES public.sale_items(id) ON DELETE SET NULL,
  product_id uuid NOT NULL REFERENCES public.products(id),
  batch_id uuid REFERENCES public.batches(id),
  qty numeric NOT NULL CHECK (qty > 0),
  unit_price numeric(14,4) NOT NULL,
  line_total numeric(14,4) NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_return_items TO authenticated;
GRANT ALL ON public.sale_return_items TO service_role;
ALTER TABLE public.sale_return_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sri_tenant_select" ON public.sale_return_items FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "sri_tenant_write" ON public.sale_return_items FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

-- 6) Purchase returns
CREATE TABLE IF NOT EXISTS public.purchase_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  return_no text NOT NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  grn_id uuid REFERENCES public.goods_receipts(id) ON DELETE SET NULL,
  return_date date NOT NULL DEFAULT CURRENT_DATE,
  reason text,
  total_value numeric(14,4) NOT NULL DEFAULT 0,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, return_no)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_returns TO authenticated;
GRANT ALL ON public.purchase_returns TO service_role;
ALTER TABLE public.purchase_returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pr_tenant_select" ON public.purchase_returns FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "pr_tenant_write" ON public.purchase_returns FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE TRIGGER trg_pr_updated BEFORE UPDATE ON public.purchase_returns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.purchase_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  return_id uuid NOT NULL REFERENCES public.purchase_returns(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  batch_id uuid REFERENCES public.batches(id),
  qty numeric NOT NULL CHECK (qty > 0),
  unit_cost numeric(14,4) NOT NULL,
  line_total numeric(14,4) NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_return_items TO authenticated;
GRANT ALL ON public.purchase_return_items TO service_role;
ALTER TABLE public.purchase_return_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pri_tenant_select" ON public.purchase_return_items FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "pri_tenant_write" ON public.purchase_return_items FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

-- 7) pos_return RPC: atomic customer return — restocks batch, reverses ledger
CREATE OR REPLACE FUNCTION public.pos_return(
  _tenant_id uuid,
  _sale_id uuid,
  _return_no text,
  _reason text,
  _refund_method public.payment_method,
  _items jsonb -- [{sale_item_id, qty, unit_price?}]
) RETURNS public.sales_returns
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_ret public.sales_returns;
  v_sale public.sales;
  v_si public.sale_items;
  v_item jsonb;
  v_qty numeric;
  v_unit numeric;
  v_line numeric;
  v_total numeric := 0;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_sale FROM public.sales WHERE id = _sale_id AND tenant_id = _tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'sale not found' USING ERRCODE='23503'; END IF;
  IF jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'no items to return' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.sales_returns(
    tenant_id, return_no, sale_id, customer_id, reason, refund_method, created_by
  ) VALUES (
    _tenant_id, _return_no, _sale_id, v_sale.customer_id, _reason, _refund_method, auth.uid()
  ) RETURNING * INTO v_ret;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    SELECT * INTO v_si FROM public.sale_items
      WHERE id = (v_item->>'sale_item_id')::uuid AND tenant_id = _tenant_id AND sale_id = _sale_id
      FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'sale_item not found' USING ERRCODE='23503'; END IF;

    v_qty := (v_item->>'qty')::numeric;
    IF v_qty <= 0 OR v_qty > v_si.qty THEN
      RAISE EXCEPTION 'return qty must be between 0 and %', v_si.qty USING ERRCODE='22023';
    END IF;
    v_unit := COALESCE((v_item->>'unit_price')::numeric, v_si.unit_price);
    v_line := ROUND(v_qty * v_unit, 2);
    v_total := v_total + v_line;

    -- Restock batch
    IF v_si.batch_id IS NOT NULL THEN
      UPDATE public.batches SET qty_on_hand = qty_on_hand + v_qty
        WHERE id = v_si.batch_id AND tenant_id = _tenant_id;
      INSERT INTO public.stock_movements(
        tenant_id, product_id, batch_id, movement_type, qty_change, qty_after,
        reference_table, reference_id, reference_no, user_id
      ) SELECT
        _tenant_id, v_si.product_id, v_si.batch_id, 'return'::movement_type, v_qty,
        qty_on_hand, 'sales_returns', v_ret.id, _return_no, auth.uid()
      FROM public.batches WHERE id = v_si.batch_id;
    END IF;

    INSERT INTO public.sale_return_items(
      tenant_id, return_id, sale_item_id, product_id, batch_id, qty, unit_price, line_total, reason
    ) VALUES (
      _tenant_id, v_ret.id, v_si.id, v_si.product_id, v_si.batch_id,
      v_qty, v_unit, v_line, _reason
    );
  END LOOP;

  UPDATE public.sales_returns SET subtotal = v_total, total = v_total, refunded_amount = v_total
   WHERE id = v_ret.id RETURNING * INTO v_ret;

  -- Reverse customer ledger if applicable
  IF v_sale.customer_id IS NOT NULL AND v_total > 0 THEN
    PERFORM public.post_ledger_entry(
      _tenant_id, 'customer'::party_type, v_sale.customer_id, 'sales_return'::ledger_entry_type,
      0, v_total, 'sales_returns', v_ret.id, _return_no,
      'Return against invoice ' || v_sale.invoice_no
    );
  END IF;

  RETURN v_ret;
END $$;

REVOKE ALL ON FUNCTION public.pos_return(uuid,uuid,text,text,public.payment_method,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pos_return(uuid,uuid,text,text,public.payment_method,jsonb) TO authenticated;

-- 8) Clinical: patients & doctors
CREATE TABLE IF NOT EXISTS public.patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  patient_code text,
  full_name text NOT NULL,
  phone text,
  dob date,
  gender text CHECK (gender IS NULL OR gender IN ('male','female','other')),
  blood_group text,
  allergies text,
  medical_history text,
  address text,
  linked_customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, patient_code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patients TO authenticated;
GRANT ALL ON public.patients TO service_role;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pt_tenant_select" ON public.patients FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "pt_tenant_write" ON public.patients FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE TRIGGER trg_patients_updated BEFORE UPDATE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.doctors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  bmdc_no text,
  full_name text NOT NULL,
  speciality text,
  qualification text,
  phone text,
  email text,
  chamber_address text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, bmdc_no)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.doctors TO authenticated;
GRANT ALL ON public.doctors TO service_role;
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dr_tenant_select" ON public.doctors FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "dr_tenant_write" ON public.doctors FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE TRIGGER trg_doctors_updated BEFORE UPDATE ON public.doctors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 9) Loyalty points
CREATE TABLE IF NOT EXISTS public.customer_loyalty_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  entry_type text NOT NULL CHECK (entry_type IN ('earn','redeem','expire','adjust')),
  points integer NOT NULL,
  reference_table text,
  reference_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_loyalty_points TO authenticated;
GRANT ALL ON public.customer_loyalty_points TO service_role;
ALTER TABLE public.customer_loyalty_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clp_tenant_select" ON public.customer_loyalty_points FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "clp_tenant_write" ON public.customer_loyalty_points FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE INDEX IF NOT EXISTS idx_clp_customer ON public.customer_loyalty_points(customer_id);

-- 10) Attach audit triggers to new write-heavy tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sales_returns','sale_return_items','purchase_returns','purchase_return_items',
    'subscriptions','patients','doctors','customer_loyalty_points'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%I ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.audit_row_change()', t, t);
  END LOOP;
END $$;
