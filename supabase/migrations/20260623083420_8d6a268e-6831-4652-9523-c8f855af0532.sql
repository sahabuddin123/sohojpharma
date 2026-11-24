
CREATE OR REPLACE FUNCTION public.tg_admin_notify_security_event()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.notify_admin(
    CASE WHEN NEW.severity IN ('error','critical') THEN 'error'
         WHEN NEW.severity = 'warning' THEN 'warning'
         ELSE 'warning' END,
    'security_alert',
    'Security Alert: ' || NEW.event_type,
    COALESCE(NEW.detail, NEW.event_type),
    '/admin/audit-logs',
    'security_event', NEW.id,
    jsonb_build_object(
      'event_type', NEW.event_type,
      'user_id', NEW.user_id,
      'tenant_id', NEW.tenant_id,
      'ip_address', NEW.ip_address::text,
      'severity', NEW.severity
    ),
    'security_alert:' || NEW.id::text
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_admin_notify_security_event ON public.security_events;
CREATE TRIGGER tg_admin_notify_security_event
AFTER INSERT ON public.security_events
FOR EACH ROW EXECUTE FUNCTION public.tg_admin_notify_security_event();
