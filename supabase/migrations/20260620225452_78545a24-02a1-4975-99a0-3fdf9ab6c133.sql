
-- 1) Add notifications jsonb to tenant_settings (idempotent)
ALTER TABLE public.tenant_settings
  ADD COLUMN IF NOT EXISTS notifications jsonb NOT NULL DEFAULT jsonb_build_object(
    'email', true,
    'push', true,
    'sms', false,
    'low_stock', true,
    'out_of_stock', true,
    'expiry', true,
    'batch_recall', true,
    'sales', true,
    'large_sale', true,
    'refund', true,
    'discount_override', true,
    'purchase', true,
    'po_approved', true,
    'grn_approved', true,
    'transfer_approved', true,
    'returns', true,
    'clinical_alerts', true,
    'interaction', true,
    'allergy', true,
    'critical_prescription', true,
    'security', true,
    'login_alerts', true,
    'failed_login', true,
    'permission_change', true,
    'role_change', true,
    'executive_alerts', true,
    'daily_digest', true,
    'daily_digest_time', '08:00',
    'weekly_digest', true,
    'weekly_digest_day', 'monday',
    'weekly_digest_time', '08:00'
  );

-- 2) Add digest_enabled to per-user preferences
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS digest_enabled boolean NOT NULL DEFAULT true;

-- 3) Delivery gate
CREATE OR REPLACE FUNCTION public.notification_should_deliver(
  _tenant_id uuid, _user_id uuid, _alert_type text, _channel text DEFAULT 'push'
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _t jsonb;
  _np public.notification_preferences;
  _channel_ok boolean := true;
BEGIN
  -- Tenant-level toggles
  SELECT notifications INTO _t FROM public.tenant_settings WHERE tenant_id = _tenant_id;
  IF _t IS NULL THEN
    RETURN true; -- no settings row yet → permissive default
  END IF;

  -- Channel off at tenant?
  IF _channel = 'email' AND COALESCE((_t->>'email')::boolean, true) = false THEN RETURN false; END IF;
  IF _channel = 'push'  AND COALESCE((_t->>'push')::boolean,  true) = false THEN RETURN false; END IF;
  IF _channel = 'sms'   AND COALESCE((_t->>'sms')::boolean,   false) = false THEN RETURN false; END IF;

  -- Alert type off at tenant?
  IF _alert_type IS NOT NULL
     AND _t ? _alert_type
     AND COALESCE((_t->>_alert_type)::boolean, true) = false THEN
    RETURN false;
  END IF;

  -- User-level overrides
  SELECT * INTO _np FROM public.notification_preferences WHERE user_id = _user_id;
  IF FOUND THEN
    IF _channel = 'email'    AND _np.email_enabled    = false THEN RETURN false; END IF;
    IF _channel = 'push'     AND _np.push_enabled     = false THEN RETURN false; END IF;
    IF _channel = 'sms'      AND _np.sms_enabled      = false THEN RETURN false; END IF;
    IF _channel = 'whatsapp' AND _np.whatsapp_enabled = false THEN RETURN false; END IF;

    IF _alert_type IN ('daily_digest','weekly_digest')
       AND _np.digest_enabled = false THEN
      RETURN false;
    END IF;

    IF _alert_type IS NOT NULL
       AND _np.categories IS NOT NULL
       AND _np.categories ? _alert_type
       AND COALESCE((_np.categories->>_alert_type)::boolean, true) = false THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.notification_should_deliver(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notification_should_deliver(uuid, uuid, text, text) TO authenticated, service_role;
