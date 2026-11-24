
-- =========================
-- 1) admin_notifications table
-- =========================
CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  archived_at timestamptz,
  severity text NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info','success','warning','error')),
  type text NOT NULL,
  title text NOT NULL,
  message text,
  link text,
  entity_type text,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  idempotency_key text
);

CREATE INDEX IF NOT EXISTS admin_notifications_created_at_idx
  ON public.admin_notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_notifications_type_idx
  ON public.admin_notifications (type);
CREATE INDEX IF NOT EXISTS admin_notifications_read_at_idx
  ON public.admin_notifications (read_at);
CREATE UNIQUE INDEX IF NOT EXISTS admin_notifications_idem_uniq
  ON public.admin_notifications (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_notifications TO authenticated;
GRANT ALL ON public.admin_notifications TO service_role;

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read admin_notifications" ON public.admin_notifications;
CREATE POLICY "admins read admin_notifications"
  ON public.admin_notifications FOR SELECT
  TO authenticated
  USING (public.is_app_admin(auth.uid()));

DROP POLICY IF EXISTS "admins write admin_notifications" ON public.admin_notifications;
CREATE POLICY "admins write admin_notifications"
  ON public.admin_notifications FOR UPDATE
  TO authenticated
  USING (public.is_app_admin(auth.uid()))
  WITH CHECK (public.is_app_admin(auth.uid()));

DROP POLICY IF EXISTS "admins delete admin_notifications" ON public.admin_notifications;
CREATE POLICY "admins delete admin_notifications"
  ON public.admin_notifications FOR DELETE
  TO authenticated
  USING (public.is_app_admin(auth.uid()));

-- =========================
-- 2) notify_admin RPC
-- =========================
CREATE OR REPLACE FUNCTION public.notify_admin(
  _severity text,
  _type text,
  _title text,
  _message text DEFAULT NULL,
  _link text DEFAULT NULL,
  _entity_type text DEFAULT NULL,
  _entity_id uuid DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb,
  _idempotency_key text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO v_id
      FROM public.admin_notifications
     WHERE idempotency_key = _idempotency_key
     LIMIT 1;
    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;
  END IF;

  INSERT INTO public.admin_notifications(
    severity, type, title, message, link,
    entity_type, entity_id, metadata, created_by, idempotency_key
  ) VALUES (
    COALESCE(_severity,'info'), _type, _title, _message, _link,
    _entity_type, _entity_id, COALESCE(_metadata,'{}'::jsonb),
    auth.uid(), _idempotency_key
  )
  RETURNING id INTO v_id;

  -- Best-effort audit log
  BEGIN
    INSERT INTO public.audit_log(
      tenant_id, user_id, action, entity_table, entity_id, after_data
    ) VALUES (
      NULL, auth.uid(), 'admin_notification', 'admin_notifications', v_id,
      jsonb_build_object('type', _type, 'severity', _severity, 'title', _title)
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_admin(text,text,text,text,text,text,uuid,jsonb,text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.notify_admin(text,text,text,text,text,text,uuid,jsonb,text) TO authenticated, service_role;

-- =========================
-- 3) Helper RPCs
-- =========================
CREATE OR REPLACE FUNCTION public.unread_admin_notifications_count()
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*) FROM public.admin_notifications
   WHERE read_at IS NULL AND archived_at IS NULL
$$;
REVOKE EXECUTE ON FUNCTION public.unread_admin_notifications_count() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.unread_admin_notifications_count() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mark_admin_notifications_read(_ids uuid[])
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.admin_notifications SET read_at = now()
   WHERE id = ANY(_ids) AND read_at IS NULL;
$$;
REVOKE EXECUTE ON FUNCTION public.mark_admin_notifications_read(uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.mark_admin_notifications_read(uuid[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mark_all_admin_notifications_read()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.admin_notifications SET read_at = now()
   WHERE read_at IS NULL AND archived_at IS NULL;
$$;
REVOKE EXECUTE ON FUNCTION public.mark_all_admin_notifications_read() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.mark_all_admin_notifications_read() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.archive_admin_notifications(_ids uuid[])
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.admin_notifications SET archived_at = now()
   WHERE id = ANY(_ids) AND archived_at IS NULL;
$$;
REVOKE EXECUTE ON FUNCTION public.archive_admin_notifications(uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.archive_admin_notifications(uuid[]) TO authenticated, service_role;

-- =========================
-- 4) Trigger: tenants (registration + lifecycle)
-- =========================
CREATE OR REPLACE FUNCTION public.tg_admin_notify_tenant()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_admin(
      'info', 'store_registered',
      'New Store Registration',
      COALESCE(NEW.name,'A pharmacy') || ' applied for approval.',
      '/admin/stores/pending',
      'tenant', NEW.id,
      jsonb_build_object('slug', NEW.slug, 'status', NEW.status),
      'tenant_registered:' || NEW.id::text
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'active' AND OLD.status IN ('pending','rejected') THEN
      PERFORM public.notify_admin(
        'success','store_approved','Store Approved',
        COALESCE(NEW.name,'Store') || ' is now active.',
        '/admin/stores',
        'tenant', NEW.id, jsonb_build_object('from', OLD.status),
        'tenant_approved:' || NEW.id::text || ':' || extract(epoch from now())::text
      );
    ELSIF NEW.status = 'active' AND OLD.status IN ('suspended','expired') THEN
      PERFORM public.notify_admin(
        'success','store_reactivated','Store Reactivated',
        COALESCE(NEW.name,'Store') || ' has been reactivated.',
        '/admin/stores',
        'tenant', NEW.id, jsonb_build_object('from', OLD.status), NULL
      );
    ELSIF NEW.status = 'rejected' THEN
      PERFORM public.notify_admin(
        'warning','store_rejected','Store Rejected',
        COALESCE(NEW.name,'Store') || ' registration was rejected.',
        '/admin/stores',
        'tenant', NEW.id, jsonb_build_object('from', OLD.status), NULL
      );
    ELSIF NEW.status = 'suspended' THEN
      PERFORM public.notify_admin(
        'warning','store_suspended','Store Suspended',
        COALESCE(NEW.name,'Store') || ' has been suspended.',
        '/admin/stores',
        'tenant', NEW.id, jsonb_build_object('from', OLD.status), NULL
      );
    ELSIF NEW.status = 'expired' THEN
      PERFORM public.notify_admin(
        'warning','subscription_expired','Subscription Expired',
        COALESCE(NEW.name,'Store') || ' subscription has expired.',
        '/admin/subscriptions',
        'tenant', NEW.id, jsonb_build_object('from', OLD.status), NULL
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_admin_notify_tenant ON public.tenants;
CREATE TRIGGER tg_admin_notify_tenant
AFTER INSERT OR UPDATE OF status ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.tg_admin_notify_tenant();

-- =========================
-- 5) Trigger: subscription_payments
-- =========================
CREATE OR REPLACE FUNCTION public.tg_admin_notify_subpay()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_name text;
BEGIN
  SELECT name INTO v_name FROM public.tenants WHERE id = NEW.tenant_id;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_admin(
      'info','payment_created','New Subscription Payment',
      COALESCE(v_name,'Tenant') || ' submitted a ' || NEW.amount::text || ' ' || NEW.currency || ' payment.',
      '/admin/payments',
      'subscription_payment', NEW.id,
      jsonb_build_object('amount', NEW.amount, 'currency', NEW.currency, 'method', NEW.method, 'tenant_id', NEW.tenant_id),
      'subpay_created:' || NEW.id::text
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('approved','succeeded','paid','completed') THEN
      PERFORM public.notify_admin(
        'success','payment_executed','Payment Succeeded',
        COALESCE(v_name,'Tenant') || ' payment of ' || NEW.amount::text || ' ' || NEW.currency || ' succeeded.',
        '/admin/payments',
        'subscription_payment', NEW.id,
        jsonb_build_object('amount', NEW.amount, 'currency', NEW.currency, 'tenant_id', NEW.tenant_id),
        'subpay_executed:' || NEW.id::text
      );
    ELSIF NEW.status IN ('failed','rejected','cancelled') THEN
      PERFORM public.notify_admin(
        'error','payment_failed','Payment Failed',
        COALESCE(v_name,'Tenant') || ' payment of ' || NEW.amount::text || ' ' || NEW.currency || ' failed.',
        '/admin/payments',
        'subscription_payment', NEW.id,
        jsonb_build_object('reason', NEW.gateway_error, 'tenant_id', NEW.tenant_id),
        'subpay_failed:' || NEW.id::text
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_admin_notify_subpay ON public.subscription_payments;
CREATE TRIGGER tg_admin_notify_subpay
AFTER INSERT OR UPDATE OF status ON public.subscription_payments
FOR EACH ROW EXECUTE FUNCTION public.tg_admin_notify_subpay();

-- =========================
-- 6) Trigger: subscriptions (expiring / expired / reactivated)
-- =========================
CREATE OR REPLACE FUNCTION public.tg_admin_notify_subscription()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_name text;
BEGIN
  SELECT name INTO v_name FROM public.tenants WHERE id = NEW.tenant_id;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'expired' THEN
      PERFORM public.notify_admin(
        'warning','subscription_expired','Subscription Expired',
        COALESCE(v_name,'Tenant') || ' subscription expired.',
        '/admin/subscriptions',
        'subscription', NEW.id,
        jsonb_build_object('tenant_id', NEW.tenant_id), NULL
      );
    ELSIF NEW.status = 'active' AND OLD.status IN ('expired','past_due','cancelled') THEN
      PERFORM public.notify_admin(
        'success','subscription_reactivated','Subscription Reactivated',
        COALESCE(v_name,'Tenant') || ' subscription is active again.',
        '/admin/subscriptions',
        'subscription', NEW.id,
        jsonb_build_object('tenant_id', NEW.tenant_id, 'from', OLD.status), NULL
      );
    ELSIF NEW.status = 'past_due' THEN
      PERFORM public.notify_admin(
        'warning','subscription_expiring','Subscription Expiring',
        COALESCE(v_name,'Tenant') || ' subscription is past due.',
        '/admin/subscriptions',
        'subscription', NEW.id,
        jsonb_build_object('tenant_id', NEW.tenant_id, 'grace_until', NEW.grace_until), NULL
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_admin_notify_subscription ON public.subscriptions;
CREATE TRIGGER tg_admin_notify_subscription
AFTER UPDATE OF status ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.tg_admin_notify_subscription();
