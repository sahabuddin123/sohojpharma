
CREATE TABLE IF NOT EXISTS public.app_admins (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES auth.users(id),
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_admins TO authenticated;
GRANT ALL    ON public.app_admins TO service_role;
ALTER TABLE public.app_admins ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_app_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.app_admins WHERE user_id = _user_id)
$$;

CREATE POLICY "admins read app_admins" ON public.app_admins
  FOR SELECT TO authenticated USING (public.is_app_admin(auth.uid()) OR user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  plan_id         uuid REFERENCES public.plans(id),
  billing_cycle   text NOT NULL DEFAULT 'monthly',
  amount          numeric(14,2) NOT NULL,
  currency        text NOT NULL DEFAULT 'BDT',
  method          text NOT NULL,
  transaction_id  text,
  proof_url       text,
  notes           text,
  status          text NOT NULL DEFAULT 'pending_review'
                  CHECK (status IN ('pending_review','approved','rejected','cancelled')),
  submitted_by    uuid REFERENCES auth.users(id),
  reviewed_by     uuid REFERENCES auth.users(id),
  reviewed_at     timestamptz,
  review_notes    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subpay_tenant_status
  ON public.subscription_payments(tenant_id, status, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.subscription_payments TO authenticated;
GRANT ALL                     ON public.subscription_payments TO service_role;
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read own tenant payments" ON public.subscription_payments
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id) OR public.is_app_admin(auth.uid()));
CREATE POLICY "members submit payment" ON public.subscription_payments
  FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id) AND submitted_by = auth.uid());
CREATE POLICY "admins update payment" ON public.subscription_payments
  FOR UPDATE TO authenticated
  USING (public.is_app_admin(auth.uid()))
  WITH CHECK (public.is_app_admin(auth.uid()));

CREATE TRIGGER trg_subpay_updated_at BEFORE UPDATE ON public.subscription_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  subject     text NOT NULL,
  category    text NOT NULL DEFAULT 'general',
  priority    text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status      text NOT NULL DEFAULT 'open'   CHECK (status   IN ('open','pending','resolved','closed')),
  created_by  uuid REFERENCES auth.users(id),
  assigned_to uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT ALL                     ON public.support_tickets TO service_role;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read tenant tickets" ON public.support_tickets
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id) OR public.is_app_admin(auth.uid()));
CREATE POLICY "members create ticket" ON public.support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id) AND created_by = auth.uid());
CREATE POLICY "members update own ticket or admin" ON public.support_tickets
  FOR UPDATE TO authenticated
  USING ((public.is_tenant_member(auth.uid(), tenant_id) AND created_by = auth.uid())
         OR public.is_app_admin(auth.uid()))
  WITH CHECK ((public.is_tenant_member(auth.uid(), tenant_id) AND created_by = auth.uid())
              OR public.is_app_admin(auth.uid()));

CREATE TRIGGER trg_ticket_updated_at BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id  uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_id  uuid REFERENCES auth.users(id),
  body       text NOT NULL,
  is_staff   boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.support_ticket_messages TO authenticated;
GRANT ALL           ON public.support_ticket_messages TO service_role;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read ticket messages" ON public.support_ticket_messages
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id
            AND (public.is_tenant_member(auth.uid(), t.tenant_id) OR public.is_app_admin(auth.uid())))
  );
CREATE POLICY "send ticket message" ON public.support_ticket_messages
  FOR INSERT TO authenticated WITH CHECK (
    author_id = auth.uid() AND
    EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id
            AND (public.is_tenant_member(auth.uid(), t.tenant_id) OR public.is_app_admin(auth.uid())))
  );

CREATE TABLE IF NOT EXISTS public.announcements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  body          text NOT NULL,
  level         text NOT NULL DEFAULT 'info' CHECK (level IN ('info','success','warning','critical')),
  audience      text NOT NULL DEFAULT 'all'  CHECK (audience IN ('all','plan','tenant')),
  plan_code     text,
  tenant_id     uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  starts_at     timestamptz NOT NULL DEFAULT now(),
  ends_at       timestamptz,
  is_dismissible boolean NOT NULL DEFAULT true,
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.announcements TO authenticated;
GRANT ALL    ON public.announcements TO service_role;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read live announcements" ON public.announcements
  FOR SELECT TO authenticated USING (
    public.is_app_admin(auth.uid()) OR (
      (starts_at <= now()) AND (ends_at IS NULL OR ends_at > now()) AND (
        audience = 'all'
        OR (audience = 'tenant' AND public.is_tenant_member(auth.uid(), tenant_id))
        OR (audience = 'plan'   AND EXISTS (
              SELECT 1 FROM public.tenant_members tm
              JOIN public.tenants t ON t.id = tm.tenant_id
              WHERE tm.user_id = auth.uid() AND t.plan::text = announcements.plan_code))
      )
    )
  );
CREATE POLICY "admins write announcements" ON public.announcements
  FOR ALL TO authenticated
  USING (public.is_app_admin(auth.uid()))
  WITH CHECK (public.is_app_admin(auth.uid()));

CREATE TRIGGER trg_announce_updated_at BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.announcement_dismissals (
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  dismissed_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, announcement_id)
);
GRANT SELECT, INSERT, DELETE ON public.announcement_dismissals TO authenticated;
GRANT ALL ON public.announcement_dismissals TO service_role;
ALTER TABLE public.announcement_dismissals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own dismissals" ON public.announcement_dismissals
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.franchises (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  region      text,
  hq_branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  default_royalty_pct numeric(6,3) NOT NULL DEFAULT 0,
  notes       text,
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.franchises TO authenticated;
GRANT ALL ON public.franchises TO service_role;
ALTER TABLE public.franchises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members manage franchises" ON public.franchises
  FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id) OR public.is_app_admin(auth.uid()))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id) OR public.is_app_admin(auth.uid()));
CREATE TRIGGER trg_franchise_updated_at BEFORE UPDATE ON public.franchises
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.franchise_branches (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  franchise_id uuid NOT NULL REFERENCES public.franchises(id) ON DELETE CASCADE,
  branch_id    uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  royalty_pct  numeric(6,3),
  joined_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (franchise_id, branch_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.franchise_branches TO authenticated;
GRANT ALL ON public.franchise_branches TO service_role;
ALTER TABLE public.franchise_branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "franchise_branches via franchise" ON public.franchise_branches
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.franchises f WHERE f.id = franchise_id
                 AND (public.is_tenant_member(auth.uid(), f.tenant_id) OR public.is_app_admin(auth.uid()))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.franchises f WHERE f.id = franchise_id
                      AND (public.is_tenant_member(auth.uid(), f.tenant_id) OR public.is_app_admin(auth.uid()))));

CREATE OR REPLACE FUNCTION public.current_tenant_subscription_status(_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sub public.subscriptions; v_state text; v_days int;
BEGIN
  SELECT * INTO v_sub FROM public.subscriptions
    WHERE tenant_id = _tenant_id ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('state','none','days_remaining',0);
  END IF;
  IF v_sub.trial_ends_at IS NOT NULL AND v_sub.trial_ends_at > now()
     AND (v_sub.current_period_end IS NULL OR v_sub.trial_ends_at >= v_sub.current_period_end) THEN
    v_state := 'trial';
    v_days  := GREATEST(0, EXTRACT(DAY FROM v_sub.trial_ends_at - now())::int);
  ELSIF v_sub.current_period_end IS NOT NULL AND v_sub.current_period_end > now() THEN
    v_state := 'active';
    v_days  := GREATEST(0, EXTRACT(DAY FROM v_sub.current_period_end - now())::int);
  ELSIF v_sub.grace_period_ends_at IS NOT NULL AND v_sub.grace_period_ends_at > now() THEN
    v_state := 'grace';
    v_days  := GREATEST(0, EXTRACT(DAY FROM v_sub.grace_period_ends_at - now())::int);
  ELSIF v_sub.status = 'suspended' THEN
    v_state := 'suspended'; v_days := 0;
  ELSE
    v_state := 'expired'; v_days := 0;
  END IF;
  RETURN jsonb_build_object(
    'state', v_state, 'days_remaining', v_days,
    'subscription_id', v_sub.id, 'plan_id', v_sub.plan_id,
    'current_period_end', v_sub.current_period_end,
    'trial_ends_at', v_sub.trial_ends_at,
    'status', v_sub.status
  );
END $$;

CREATE OR REPLACE FUNCTION public.assert_subscription_active(_tenant_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_state text;
BEGIN
  v_state := public.current_tenant_subscription_status(_tenant_id)->>'state';
  IF v_state NOT IN ('active','trial','grace') THEN
    RAISE EXCEPTION 'subscription_inactive: state=%', v_state
      USING ERRCODE='P0001', HINT='Renew your subscription to continue.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.approve_subscription_payment(_payment_id uuid, _notes text DEFAULT NULL)
RETURNS subscriptions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pay public.subscription_payments;
  v_sub public.subscriptions;
  v_plan public.plans;
  v_period_start timestamptz;
  v_months int;
BEGIN
  IF NOT public.is_app_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_pay FROM public.subscription_payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment not found' USING ERRCODE='23503'; END IF;
  IF v_pay.status <> 'pending_review' THEN
    RAISE EXCEPTION 'payment already %', v_pay.status USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_plan FROM public.plans WHERE id = v_pay.plan_id;

  v_months := CASE WHEN v_pay.billing_cycle = 'yearly' THEN 12 ELSE 1 END;

  SELECT * INTO v_sub FROM public.subscriptions
    WHERE tenant_id = v_pay.tenant_id ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.subscriptions(
      tenant_id, plan_id, status, current_period_start, current_period_end, billing_cycle, last_payment_at
    ) VALUES (
      v_pay.tenant_id, v_pay.plan_id, 'active', now(),
      now() + make_interval(months => v_months), v_pay.billing_cycle, now()
    ) RETURNING * INTO v_sub;
  ELSE
    v_period_start := GREATEST(COALESCE(v_sub.current_period_end, now()), now());
    UPDATE public.subscriptions
       SET plan_id = v_pay.plan_id,
           status  = 'active',
           current_period_start = COALESCE(current_period_start, now()),
           current_period_end   = v_period_start + make_interval(months => v_months),
           billing_cycle        = v_pay.billing_cycle,
           last_payment_at      = now(),
           grace_period_ends_at = NULL,
           cancelled_at         = NULL
     WHERE id = v_sub.id RETURNING * INTO v_sub;
  END IF;

  UPDATE public.subscription_payments
     SET status='approved', reviewed_by=auth.uid(), reviewed_at=now(),
         review_notes=_notes, subscription_id=v_sub.id
   WHERE id = _payment_id;

  IF v_plan.code IS NOT NULL THEN
    BEGIN
      UPDATE public.tenants SET plan = v_plan.code::public.tenant_plan WHERE id = v_pay.tenant_id;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  PERFORM public.audit_log_event(
    v_pay.tenant_id, 'subscription.payment_approved', 'subscription_payments', _payment_id, NULL,
    jsonb_build_object('amount', v_pay.amount, 'method', v_pay.method, 'cycle', v_pay.billing_cycle)
  );

  RETURN v_sub;
END $$;

CREATE OR REPLACE FUNCTION public.reject_subscription_payment(_payment_id uuid, _notes text DEFAULT NULL)
RETURNS subscription_payments LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pay public.subscription_payments;
BEGIN
  IF NOT public.is_app_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  UPDATE public.subscription_payments
     SET status='rejected', reviewed_by=auth.uid(), reviewed_at=now(), review_notes=_notes
   WHERE id = _payment_id AND status='pending_review'
   RETURNING * INTO v_pay;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment not found or already reviewed' USING ERRCODE='22023';
  END IF;
  PERFORM public.audit_log_event(
    v_pay.tenant_id, 'subscription.payment_rejected', 'subscription_payments', _payment_id, NULL,
    jsonb_build_object('notes', _notes)
  );
  RETURN v_pay;
END $$;
