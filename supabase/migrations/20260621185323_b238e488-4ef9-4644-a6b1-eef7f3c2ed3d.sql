
-- FIX 1: Database-level guard preventing non-admins from changing tenants.status.
-- Even with permissive RLS UPDATE policies (owner / corporate_admin), this trigger
-- rejects any status change unless the caller is a SaaS App Admin or the call is
-- made via SECURITY DEFINER (e.g. signup bootstrap, audit trigger).
CREATE OR REPLACE FUNCTION public.tenant_status_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF auth.uid() IS NULL OR NOT public.is_app_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Only SaaS App Admin may change tenants.status (attempted % -> %)', OLD.status, NEW.status
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_status_guard ON public.tenants;
CREATE TRIGGER trg_tenant_status_guard
BEFORE UPDATE OF status ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.tenant_status_guard();

-- FIX 2: Remove dead 'approved' state from the tenant lifecycle.
ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_status_check;
-- Migrate any rows that somehow ended up 'approved' -> 'active' (no app code ever wrote it).
UPDATE public.tenants SET status = 'active' WHERE status = 'approved';
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_status_check
  CHECK (status IN ('pending','active','suspended','expired','rejected'));

-- Drop the dead branch from the audit trigger mapping.
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
