
-- =============================================================
-- PHASE B1 — INVOICE STATE MACHINE
-- =============================================================
CREATE OR REPLACE FUNCTION public.validate_invoice_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old text := OLD.status;
  v_new text := NEW.status;
  v_allowed boolean := false;
BEGIN
  IF v_old IS NOT DISTINCT FROM v_new THEN
    RETURN NEW;
  END IF;

  IF current_setting('app.bypass_invoice_transition', true) = 'on' THEN
    RETURN NEW;
  END IF;

  v_allowed := CASE
    WHEN v_old = 'draft'     AND v_new = 'unpaid'                                THEN true
    WHEN v_old = 'unpaid'    AND v_new IN ('paid','cancelled','overdue')         THEN true
    WHEN v_old = 'overdue'   AND v_new IN ('paid','cancelled')                   THEN true
    WHEN v_old = 'paid'      AND v_new = 'refunded'                              THEN true
    ELSE false
  END;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Invalid invoice status transition: % -> %', v_old, v_new
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_subscription_invoices_validate_transition ON public.subscription_invoices;
CREATE TRIGGER tg_subscription_invoices_validate_transition
  BEFORE UPDATE OF status ON public.subscription_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_invoice_transition();

-- =============================================================
-- PHASE B2 — PAID INVOICE IMMUTABILITY
-- =============================================================
CREATE OR REPLACE FUNCTION public.protect_paid_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('paid','refunded') THEN
      RAISE EXCEPTION 'Cannot delete % invoice %', OLD.status, OLD.invoice_no
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'paid' THEN
    IF NEW.amount      IS DISTINCT FROM OLD.amount      THEN RAISE EXCEPTION 'Cannot change amount on paid invoice'; END IF;
    IF NEW.vat         IS DISTINCT FROM OLD.vat         THEN RAISE EXCEPTION 'Cannot change vat on paid invoice'; END IF;
    IF NEW.vat_percent IS DISTINCT FROM OLD.vat_percent THEN RAISE EXCEPTION 'Cannot change vat_percent on paid invoice'; END IF;
    IF NEW.discount    IS DISTINCT FROM OLD.discount    THEN RAISE EXCEPTION 'Cannot change discount on paid invoice'; END IF;
    IF NEW.grand_total IS DISTINCT FROM OLD.grand_total THEN RAISE EXCEPTION 'Cannot change grand_total on paid invoice'; END IF;
    IF NEW.invoice_no  IS DISTINCT FROM OLD.invoice_no  THEN RAISE EXCEPTION 'Cannot change invoice_no on paid invoice'; END IF;
    IF NEW.plan_id     IS DISTINCT FROM OLD.plan_id     THEN RAISE EXCEPTION 'Cannot change plan_id on paid invoice'; END IF;
    IF NEW.tenant_id   IS DISTINCT FROM OLD.tenant_id   THEN RAISE EXCEPTION 'Cannot change tenant on paid invoice'; END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_subscription_invoices_protect_update ON public.subscription_invoices;
CREATE TRIGGER tg_subscription_invoices_protect_update
  BEFORE UPDATE ON public.subscription_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_paid_invoice();

DROP TRIGGER IF EXISTS tg_subscription_invoices_protect_delete ON public.subscription_invoices;
CREATE TRIGGER tg_subscription_invoices_protect_delete
  BEFORE DELETE ON public.subscription_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_paid_invoice();

-- =============================================================
-- PHASE B3 — REFUND REVERSAL
-- =============================================================
CREATE OR REPLACE FUNCTION public.refund_subscription_payment(
  _payment_id uuid,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pay   public.subscription_payments%ROWTYPE;
  v_inv   public.subscription_invoices%ROWTYPE;
  v_sub   public.subscriptions%ROWTYPE;
  v_days  int;
  v_new_exp timestamptz;
  v_suspended boolean := false;
  v_owner uuid;
BEGIN
  IF NOT public.is_app_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_pay FROM public.subscription_payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment not found'; END IF;

  IF v_pay.status NOT IN ('approved','paid') THEN
    RAISE EXCEPTION 'only approved/paid payments can be refunded (current: %)', v_pay.status;
  END IF;

  -- Locate the invoice this payment settled
  SELECT * INTO v_inv FROM public.subscription_invoices
   WHERE payment_id = v_pay.id OR id = (
     SELECT id FROM public.subscription_invoices
      WHERE tenant_id = v_pay.tenant_id AND status = 'paid'
      ORDER BY paid_at DESC NULLS LAST LIMIT 1
   )
   ORDER BY paid_at DESC NULLS LAST LIMIT 1;

  IF v_pay.subscription_id IS NOT NULL THEN
    SELECT * INTO v_sub FROM public.subscriptions
     WHERE id = v_pay.subscription_id FOR UPDATE;
  END IF;

  -- Reverse subscription extension
  IF FOUND AND v_inv.id IS NOT NULL THEN
    v_days := COALESCE(v_inv.duration_days, 0);
    IF v_days > 0 AND v_sub.expires_at IS NOT NULL THEN
      v_new_exp := v_sub.expires_at - make_interval(days => v_days);
      PERFORM set_config('app.bypass_sub_transition','on', true);
      IF v_new_exp <= now() THEN
        UPDATE public.subscriptions
           SET expires_at = v_new_exp,
               status = 'suspended',
               updated_at = now()
         WHERE id = v_sub.id;
        v_suspended := true;
      ELSE
        UPDATE public.subscriptions
           SET expires_at = v_new_exp, updated_at = now()
         WHERE id = v_sub.id;
      END IF;
      PERFORM set_config('app.bypass_sub_transition','off', true);
    END IF;

    -- Flip invoice paid -> refunded (allowed by B1)
    UPDATE public.subscription_invoices
       SET status = 'refunded', updated_at = now(),
           notes = COALESCE(notes,'') || E'\nREFUND: ' || COALESCE(_reason,'')
     WHERE id = v_inv.id;
  END IF;

  UPDATE public.subscription_payments
     SET status = 'refunded',
         payment_status = 'refunded',
         review_notes = COALESCE(review_notes,'') || E'\nREFUND: ' || COALESCE(_reason,''),
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         updated_at = now()
   WHERE id = v_pay.id;

  -- Audit log
  INSERT INTO public.audit_log(tenant_id, user_id, action, entity_table, entity_id, after_data)
  VALUES (
    v_pay.tenant_id, auth.uid(), 'subscription_payment_refunded',
    'subscription_payments', v_pay.id,
    jsonb_build_object(
      'reason', _reason,
      'invoice_id', v_inv.id,
      'invoice_no', v_inv.invoice_no,
      'reverted_days', v_days,
      'suspended', v_suspended,
      'new_expires_at', v_new_exp
    )
  );

  -- Notify tenant owner(s)
  FOR v_owner IN
    SELECT user_id FROM public.tenant_members WHERE tenant_id = v_pay.tenant_id
  LOOP
    INSERT INTO public.notifications(tenant_id, user_id, type, severity, title, body, entity_type, entity_id, data)
    VALUES (
      v_pay.tenant_id, v_owner, 'subscription_refund', 'warning',
      'Payment refunded',
      'Your payment of ' || v_pay.amount || ' ' || COALESCE(v_pay.currency,'BDT') ||
      ' has been refunded.' ||
      CASE WHEN v_suspended THEN ' Subscription suspended.' ELSE '' END,
      'subscription_payments', v_pay.id,
      jsonb_build_object('reason', _reason, 'suspended', v_suspended)
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'payment_id', v_pay.id,
    'invoice_id', v_inv.id,
    'reverted_days', v_days,
    'suspended', v_suspended
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.refund_subscription_payment(uuid, text) TO authenticated;

-- =============================================================
-- PHASE B4 — bKash CALLBACK INVOICE STATUS GUARD
-- Wrap activate_subscription_from_payment with status check.
-- =============================================================
CREATE OR REPLACE FUNCTION public.assert_invoice_payable(_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE v_status text;
BEGIN
  IF _invoice_id IS NULL THEN RETURN; END IF;
  SELECT status INTO v_status FROM public.subscription_invoices WHERE id = _invoice_id;
  IF v_status IS NULL THEN RETURN; END IF;
  IF v_status NOT IN ('unpaid','overdue','draft') THEN
    RAISE EXCEPTION 'Invoice not payable (status=%)', v_status
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assert_invoice_payable(uuid) TO authenticated, service_role;

-- Trigger on subscription_payments: when a payment flips to paid/approved,
-- verify the linked invoice is in a payable state.
CREATE OR REPLACE FUNCTION public.tg_validate_payment_invoice_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inv_id uuid; v_status text;
BEGIN
  IF NEW.status IN ('approved','paid') AND
     (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    SELECT id, status INTO v_inv_id, v_status
      FROM public.subscription_invoices
     WHERE tenant_id = NEW.tenant_id
       AND subscription_id = NEW.subscription_id
       AND status IN ('unpaid','overdue','draft','paid','cancelled','refunded')
     ORDER BY created_at DESC LIMIT 1;
    IF v_status IS NOT NULL AND v_status IN ('cancelled','refunded') THEN
      RAISE EXCEPTION 'Cannot settle payment against % invoice', v_status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_subpayment_validate_invoice ON public.subscription_payments;
CREATE TRIGGER tg_subpayment_validate_invoice
  BEFORE INSERT OR UPDATE OF status ON public.subscription_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_validate_payment_invoice_status();

-- =============================================================
-- PHASE B6 — DUNNING ENGINE
-- =============================================================
CREATE TABLE IF NOT EXISTS public.subscription_invoice_dunning (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.subscription_invoices(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  stage text NOT NULL CHECK (stage IN ('day1','day3','day7','suspended')),
  channel text NOT NULL CHECK (channel IN ('in_app','email')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb,
  UNIQUE (invoice_id, stage, channel)
);

GRANT SELECT ON public.subscription_invoice_dunning TO authenticated;
GRANT ALL ON public.subscription_invoice_dunning TO service_role;

ALTER TABLE public.subscription_invoice_dunning ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dunning_tenant_select ON public.subscription_invoice_dunning;
CREATE POLICY dunning_tenant_select ON public.subscription_invoice_dunning
  FOR SELECT TO authenticated
  USING (
    public.is_app_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.tenant_members tm
       WHERE tm.tenant_id = subscription_invoice_dunning.tenant_id
         AND tm.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_dunning_invoice ON public.subscription_invoice_dunning(invoice_id);

-- Dunning processor: runs reminders, then suspension on day 7+
CREATE OR REPLACE FUNCTION public.process_invoice_dunning()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_stage text;
  v_days int;
  v_count_in_app int := 0;
  v_count_email int := 0;
  v_count_susp int := 0;
  v_owner uuid;
BEGIN
  FOR r IN
    SELECT i.*
      FROM public.subscription_invoices i
     WHERE i.status IN ('unpaid','overdue')
       AND i.due_at IS NOT NULL
       AND i.due_at < now()
  LOOP
    v_days := GREATEST(0, EXTRACT(DAY FROM (now() - r.due_at))::int);
    v_stage := CASE
      WHEN v_days >= 7 THEN 'day7'
      WHEN v_days >= 3 THEN 'day3'
      WHEN v_days >= 1 THEN 'day1'
      ELSE NULL
    END;

    IF v_stage IS NULL THEN CONTINUE; END IF;

    -- In-app notifications (one row per owner, dedupe via unique)
    BEGIN
      INSERT INTO public.subscription_invoice_dunning(invoice_id, tenant_id, stage, channel, payload)
      VALUES (r.id, r.tenant_id, v_stage, 'in_app',
              jsonb_build_object('days_overdue', v_days, 'invoice_no', r.invoice_no));

      FOR v_owner IN
        SELECT user_id FROM public.tenant_members WHERE tenant_id = r.tenant_id
      LOOP
        INSERT INTO public.notifications(tenant_id, user_id, type, severity, title, body, entity_type, entity_id, data)
        VALUES (
          r.tenant_id, v_owner, 'invoice_overdue',
          CASE v_stage WHEN 'day7' THEN 'critical' WHEN 'day3' THEN 'warning' ELSE 'info' END,
          'Invoice ' || r.invoice_no || ' is overdue',
          'Your invoice for ' || r.grand_total || ' ' || COALESCE(r.currency,'BDT') ||
            ' is ' || v_days || ' day(s) overdue. Please pay to avoid suspension.',
          'subscription_invoices', r.id,
          jsonb_build_object('stage', v_stage, 'days', v_days)
        );
      END LOOP;
      v_count_in_app := v_count_in_app + 1;
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    -- Email queue (via comm_log if present)
    BEGIN
      INSERT INTO public.subscription_invoice_dunning(invoice_id, tenant_id, stage, channel, payload)
      VALUES (r.id, r.tenant_id, v_stage, 'email',
              jsonb_build_object('days_overdue', v_days, 'invoice_no', r.invoice_no));
      INSERT INTO public.comm_log(tenant_id, channel, direction, status, recipient, subject, body, entity_type, entity_id, meta)
      SELECT r.tenant_id, 'email', 'outbound', 'queued',
             COALESCE((SELECT email FROM auth.users WHERE id = tm.user_id), tm.user_id::text),
             'Invoice ' || r.invoice_no || ' is overdue',
             'Your invoice is ' || v_days || ' day(s) overdue. Amount: ' ||
               r.grand_total || ' ' || COALESCE(r.currency,'BDT'),
             'subscription_invoices', r.id,
             jsonb_build_object('stage', v_stage, 'days', v_days)
        FROM public.tenant_members tm
       WHERE tm.tenant_id = r.tenant_id;
      v_count_email := v_count_email + 1;
    EXCEPTION WHEN unique_violation THEN NULL;
             WHEN undefined_table THEN NULL;
             WHEN undefined_column THEN NULL;
    END;

    -- Suspend on day7+
    IF v_stage = 'day7' AND r.subscription_id IS NOT NULL THEN
      BEGIN
        INSERT INTO public.subscription_invoice_dunning(invoice_id, tenant_id, stage, channel, payload)
        VALUES (r.id, r.tenant_id, 'suspended', 'in_app',
                jsonb_build_object('reason','dunning_final'));
        PERFORM set_config('app.bypass_sub_transition','on', true);
        UPDATE public.subscriptions
           SET status = 'suspended', updated_at = now()
         WHERE id = r.subscription_id AND status = 'active';
        PERFORM set_config('app.bypass_sub_transition','off', true);
        INSERT INTO public.audit_log(tenant_id, action, entity_table, entity_id, after_data)
        VALUES (r.tenant_id, 'subscription_suspended_dunning',
                'subscriptions', r.subscription_id,
                jsonb_build_object('invoice_id', r.id, 'invoice_no', r.invoice_no));
        v_count_susp := v_count_susp + 1;
      EXCEPTION WHEN unique_violation THEN NULL;
      END;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'in_app', v_count_in_app,
    'email', v_count_email,
    'suspended', v_count_susp
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_invoice_dunning() TO service_role;

-- =============================================================
-- PHASE B5 + B6 — CRON JOBS
-- =============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Reconciliation: every 15 minutes
DO $$
BEGIN
  PERFORM cron.unschedule('billing-reconcile-payments');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'billing-reconcile-payments',
  '*/15 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--5a4b5c0b-d08a-4ffd-bdc7-a1a7b538b17e.lovable.app/api/public/hooks/reconcile-payments',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey','REPLACE_WITH_ANON_KEY'
    ),
    body := '{}'::jsonb
  );
  $cron$
);

-- Dunning: daily at 09:00 UTC, runs the SQL function directly
DO $$
BEGIN
  PERFORM cron.unschedule('billing-dunning-daily');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'billing-dunning-daily',
  '0 9 * * *',
  $cron$ SELECT public.process_invoice_dunning(); $cron$
);
