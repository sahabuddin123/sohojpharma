
-- ============================================================
-- 1. tenants.status lifecycle column
-- ============================================================
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- Backfill existing tenants to 'active' (safe for already-running stores).
UPDATE public.tenants SET status = 'active' WHERE status IS NULL;

-- New signups should start as pending after this migration.
ALTER TABLE public.tenants ALTER COLUMN status SET DEFAULT 'pending';

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_status_check;
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_status_check
  CHECK (status IN ('pending','approved','active','suspended','expired','rejected'));

CREATE INDEX IF NOT EXISTS idx_tenants_status ON public.tenants(status);

-- ============================================================
-- 2. approval_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.approval_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('register','approve','reject','suspend','activate','expire')),
  from_status text,
  to_status text NOT NULL,
  remarks text,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_logs_tenant ON public.approval_logs(tenant_id, created_at DESC);

GRANT SELECT, INSERT ON public.approval_logs TO authenticated;
GRANT ALL ON public.approval_logs TO service_role;

ALTER TABLE public.approval_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY approval_logs_admin_select ON public.approval_logs
  FOR SELECT TO authenticated
  USING (public.is_app_admin(auth.uid()));

CREATE POLICY approval_logs_admin_insert ON public.approval_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_app_admin(auth.uid()));

CREATE POLICY approval_logs_owner_select ON public.approval_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = approval_logs.tenant_id
        AND tm.user_id = auth.uid()
    )
  );

-- ============================================================
-- 3. notification_events (email + SMS queue, no provider yet)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email','sms')),
  event_type text NOT NULL,
  recipient text,
  subject text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','cancelled')),
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_notif_events_status ON public.notification_events(status, created_at);
CREATE INDEX IF NOT EXISTS idx_notif_events_tenant ON public.notification_events(tenant_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.notification_events TO authenticated;
GRANT ALL ON public.notification_events TO service_role;

ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY notif_events_admin_all ON public.notification_events
  FOR ALL TO authenticated
  USING (public.is_app_admin(auth.uid()))
  WITH CHECK (public.is_app_admin(auth.uid()));

CREATE POLICY notif_events_owner_select ON public.notification_events
  FOR SELECT TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = notification_events.tenant_id
        AND tm.user_id = auth.uid()
    )
  );

-- ============================================================
-- 4. Trigger: log + enqueue on status change
-- ============================================================
CREATE OR REPLACE FUNCTION public.tenant_status_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_actor uuid := auth.uid();
  v_subject text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.approval_logs(tenant_id, action, from_status, to_status, approved_by)
    VALUES (NEW.id, 'register', NULL, NEW.status, v_actor);

    INSERT INTO public.notification_events(tenant_id, channel, event_type, recipient, subject, payload)
    VALUES
      (NEW.id, 'email', 'tenant.registered', NEW.email, 'Registration received',
        jsonb_build_object('tenant_id', NEW.id, 'tenant_name', NEW.name, 'status', NEW.status)),
      (NEW.id, 'sms', 'tenant.registered', COALESCE(NEW.mobile, NEW.phone), NULL,
        jsonb_build_object('tenant_id', NEW.id, 'tenant_name', NEW.name, 'status', NEW.status));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    v_action := CASE NEW.status
      WHEN 'approved'  THEN 'approve'
      WHEN 'active'    THEN 'activate'
      WHEN 'rejected'  THEN 'reject'
      WHEN 'suspended' THEN 'suspend'
      WHEN 'expired'   THEN 'expire'
      ELSE 'activate'
    END;
    v_subject := 'Store ' || v_action || 'd';

    INSERT INTO public.approval_logs(tenant_id, action, from_status, to_status, approved_by)
    VALUES (NEW.id, v_action, OLD.status, NEW.status, v_actor);

    INSERT INTO public.notification_events(tenant_id, channel, event_type, recipient, subject, payload)
    VALUES
      (NEW.id, 'email', 'tenant.status_changed', NEW.email, v_subject,
        jsonb_build_object('tenant_id', NEW.id, 'tenant_name', NEW.name,
                           'from_status', OLD.status, 'to_status', NEW.status)),
      (NEW.id, 'sms', 'tenant.status_changed', COALESCE(NEW.mobile, NEW.phone), NULL,
        jsonb_build_object('tenant_id', NEW.id, 'tenant_name', NEW.name,
                           'from_status', OLD.status, 'to_status', NEW.status));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_status_audit ON public.tenants;
CREATE TRIGGER trg_tenant_status_audit
AFTER INSERT OR UPDATE OF status ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.tenant_status_audit();

-- ============================================================
-- 5. Helper: get current user tenant status (used by login gate)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_tenant_status()
RETURNS TABLE(tenant_id uuid, status text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.status
  FROM public.tenants t
  JOIN public.tenant_members tm ON tm.tenant_id = t.id
  WHERE tm.user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_tenant_status() TO authenticated;

-- ============================================================
-- 6. Security fix: v_customer_due_reconciliation -> security_invoker
-- ============================================================
ALTER VIEW IF EXISTS public.v_customer_due_reconciliation SET (security_invoker = on);

-- ============================================================
-- 7. Security fix: payment_gateways secret keys restricted to owner/manager/corporate_admin
-- ============================================================
DROP POLICY IF EXISTS gateways_select ON public.payment_gateways;

CREATE POLICY gateways_select_privileged ON public.payment_gateways
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), tenant_id, 'owner'::app_role)
    OR public.has_role(auth.uid(), tenant_id, 'corporate_admin'::app_role)
    OR public.has_role(auth.uid(), tenant_id, 'manager'::app_role)
  );
