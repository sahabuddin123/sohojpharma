
CREATE OR REPLACE FUNCTION public._notif_security_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN RETURN NEW; END IF;
  PERFORM public.notify_tenant_v2(
    NEW.tenant_id, 'error', 'security_violation',
    COALESCE(NEW.event_type,'Security event'),
    COALESCE(NEW.detail, NEW.event_type),
    '/admin/audit', 'security_event', NEW.id, COALESCE(NEW.metadata,'{}'::jsonb)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END; $$;
