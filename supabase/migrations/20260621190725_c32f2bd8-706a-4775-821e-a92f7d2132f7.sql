
DROP FUNCTION IF EXISTS public.check_plan_limit(uuid, text);
DROP FUNCTION IF EXISTS public.tenant_subscription_status(uuid);

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS max_warehouses int,
  ADD COLUMN IF NOT EXISTS sms_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS api_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_unlimited boolean NOT NULL DEFAULT false;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS billing_cycle text NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS starts_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS grace_until timestamptz,
  ADD COLUMN IF NOT EXISTS auto_renew boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
  ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check
    CHECK (status IN ('trial','active','past_due','expired','cancelled'));
  ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_billing_cycle_check;
  ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_billing_cycle_check
    CHECK (billing_cycle IN ('monthly','yearly'));
EXCEPTION WHEN others THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_status ON public.subscriptions(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_expires_at ON public.subscriptions(expires_at);

CREATE OR REPLACE FUNCTION public.subscription_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_user = 'service_role' OR public.is_app_admin(auth.uid()) THEN RETURN NEW; END IF;
  IF (NEW.plan_id IS DISTINCT FROM OLD.plan_id)
     OR (NEW.status IS DISTINCT FROM OLD.status)
     OR (NEW.expires_at IS DISTINCT FROM OLD.expires_at)
     OR (NEW.grace_until IS DISTINCT FROM OLD.grace_until)
     OR (NEW.starts_at IS DISTINCT FROM OLD.starts_at)
     OR (NEW.billing_cycle IS DISTINCT FROM OLD.billing_cycle) THEN
    RAISE EXCEPTION 'Only SaaS admin may change subscription plan/lifecycle' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_subscription_guard ON public.subscriptions;
CREATE TRIGGER trg_subscription_guard BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.subscription_guard();

CREATE OR REPLACE FUNCTION public.tenant_subscription_status(_tenant uuid)
RETURNS TABLE(
  status text, plan_id uuid, plan_code text,
  expires_at timestamptz, grace_until timestamptz,
  is_unlimited boolean, sms_enabled boolean, api_enabled boolean,
  max_branches int, max_warehouses int, max_users int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.status, p.id, p.code, s.expires_at, s.grace_until,
         p.is_unlimited, p.sms_enabled, p.api_enabled,
         p.max_branches, p.max_warehouses, p.max_users
  FROM public.subscriptions s JOIN public.plans p ON p.id = s.plan_id
  WHERE s.tenant_id = _tenant ORDER BY s.created_at DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.check_plan_limit(_tenant uuid, _resource text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_limit int; v_count int; v_unlimited boolean;
BEGIN
  SELECT p.is_unlimited,
         CASE _resource WHEN 'branch' THEN p.max_branches
                        WHEN 'warehouse' THEN p.max_warehouses
                        WHEN 'user' THEN p.max_users END
  INTO v_unlimited, v_limit
  FROM public.subscriptions s JOIN public.plans p ON p.id = s.plan_id
  WHERE s.tenant_id = _tenant ORDER BY s.created_at DESC LIMIT 1;
  IF v_unlimited IS NULL OR v_unlimited OR v_limit IS NULL THEN RETURN true; END IF;
  v_count := CASE _resource
    WHEN 'branch' THEN (SELECT count(*) FROM public.branches WHERE tenant_id=_tenant AND deleted_at IS NULL)
    WHEN 'warehouse' THEN (SELECT count(*) FROM public.warehouses WHERE tenant_id=_tenant AND deleted_at IS NULL)
    WHEN 'user' THEN (SELECT count(*) FROM public.tenant_members WHERE tenant_id=_tenant)
  END;
  RETURN v_count < v_limit;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_plan_limit_branch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NOT public.check_plan_limit(NEW.tenant_id, 'branch') THEN RAISE EXCEPTION 'Plan branch limit reached' USING ERRCODE='P0001'; END IF; RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION public.enforce_plan_limit_warehouse() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NOT public.check_plan_limit(NEW.tenant_id, 'warehouse') THEN RAISE EXCEPTION 'Plan warehouse limit reached' USING ERRCODE='P0001'; END IF; RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION public.enforce_plan_limit_user() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NOT public.check_plan_limit(NEW.tenant_id, 'user') THEN RAISE EXCEPTION 'Plan user limit reached' USING ERRCODE='P0001'; END IF; RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_plan_limit_branch ON public.branches;
CREATE TRIGGER trg_plan_limit_branch BEFORE INSERT ON public.branches FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_limit_branch();
DROP TRIGGER IF EXISTS trg_plan_limit_warehouse ON public.warehouses;
CREATE TRIGGER trg_plan_limit_warehouse BEFORE INSERT ON public.warehouses FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_limit_warehouse();
DROP TRIGGER IF EXISTS trg_plan_limit_user ON public.tenant_members;
CREATE TRIGGER trg_plan_limit_user BEFORE INSERT ON public.tenant_members FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_limit_user();

CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  amount numeric(14,2) NOT NULL,
  currency text NOT NULL DEFAULT 'BDT',
  provider text NOT NULL CHECK (provider IN ('bkash','nagad','sslcommerz','manual')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','success','failed','refunded')),
  provider_txn_id text,
  paid_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.payment_transactions TO authenticated;
GRANT ALL ON public.payment_transactions TO service_role;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pt_admin_all ON public.payment_transactions;
CREATE POLICY pt_admin_all ON public.payment_transactions FOR ALL TO authenticated
  USING (public.is_app_admin(auth.uid())) WITH CHECK (public.is_app_admin(auth.uid()));
DROP POLICY IF EXISTS pt_tenant_read ON public.payment_transactions;
CREATE POLICY pt_tenant_read ON public.payment_transactions FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_pt_tenant ON public.payment_transactions(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.gateway_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('request','response','callback')),
  transaction_id uuid REFERENCES public.payment_transactions(id) ON DELETE SET NULL,
  http_status int,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.gateway_logs TO authenticated;
GRANT ALL ON public.gateway_logs TO service_role;
ALTER TABLE public.gateway_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gl_admin_all ON public.gateway_logs;
CREATE POLICY gl_admin_all ON public.gateway_logs FOR ALL TO authenticated
  USING (public.is_app_admin(auth.uid())) WITH CHECK (public.is_app_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.sms_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code IN ('otp','approval','payment_success','subscription_expiry','due_reminder')),
  body_en text NOT NULL, body_bn text NOT NULL,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sms_templates TO authenticated;
GRANT ALL ON public.sms_templates TO service_role;
ALTER TABLE public.sms_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS st_read_all ON public.sms_templates;
CREATE POLICY st_read_all ON public.sms_templates FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS st_admin_write ON public.sms_templates;
CREATE POLICY st_admin_write ON public.sms_templates FOR ALL TO authenticated
  USING (public.is_app_admin(auth.uid())) WITH CHECK (public.is_app_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.sms_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  template_code text NOT NULL REFERENCES public.sms_templates(code),
  to_number text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  attempts int NOT NULL DEFAULT 0,
  last_error text, sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.sms_queue TO authenticated;
GRANT ALL ON public.sms_queue TO service_role;
ALTER TABLE public.sms_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sq_admin_all ON public.sms_queue;
CREATE POLICY sq_admin_all ON public.sms_queue FOR ALL TO authenticated
  USING (public.is_app_admin(auth.uid())) WITH CHECK (public.is_app_admin(auth.uid()));
DROP POLICY IF EXISTS sq_tenant_read ON public.sms_queue;
CREATE POLICY sq_tenant_read ON public.sms_queue FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_sq_status ON public.sms_queue(status, created_at);

CREATE TABLE IF NOT EXISTS public.sms_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid REFERENCES public.sms_queue(id) ON DELETE SET NULL,
  tenant_id uuid, template_code text, to_number text,
  status text NOT NULL,
  provider_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.sms_logs TO authenticated;
GRANT ALL ON public.sms_logs TO service_role;
ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sl_admin_all ON public.sms_logs;
CREATE POLICY sl_admin_all ON public.sms_logs FOR ALL TO authenticated
  USING (public.is_app_admin(auth.uid())) WITH CHECK (public.is_app_admin(auth.uid()));
DROP POLICY IF EXISTS sl_tenant_read ON public.sms_logs;
CREATE POLICY sl_tenant_read ON public.sms_logs FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));

INSERT INTO public.sms_templates (code, body_en, body_bn, variables) VALUES
  ('otp','Your SohojPharma OTP is {{code}}. Valid for 5 minutes.','আপনার সহজফার্মা OTP: {{code}}। ৫ মিনিটের জন্য বৈধ।','["code"]'::jsonb),
  ('approval','Your store {{store}} has been approved. Log in now.','আপনার দোকান {{store}} অনুমোদিত হয়েছে। এখনই লগইন করুন।','["store"]'::jsonb),
  ('payment_success','Payment of {{amount}} BDT received. Receipt: {{ref}}','{{amount}} টাকার পেমেন্ট গ্রহণ করা হয়েছে। রসিদ: {{ref}}','["amount","ref"]'::jsonb),
  ('subscription_expiry','Your subscription expires on {{date}}. Renew to avoid service interruption.','আপনার সাবস্ক্রিপশন {{date}} তারিখে শেষ হবে। সেবা চালু রাখতে নবায়ন করুন।','["date"]'::jsonb),
  ('due_reminder','Reminder: {{amount}} BDT due on {{date}} from {{customer}}.','স্মরণ: {{customer}} এর কাছে {{date}} তারিখে {{amount}} টাকা বকেয়া।','["customer","amount","date"]'::jsonb)
ON CONFLICT (code) DO NOTHING;
