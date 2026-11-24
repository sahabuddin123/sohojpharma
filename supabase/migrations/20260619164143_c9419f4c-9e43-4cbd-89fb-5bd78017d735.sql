
-- 1. Columns
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info','success','warning','error')),
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id uuid;

-- 2. Index for fast unread count
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications (tenant_id, user_id, read_at, created_at DESC)
  WHERE archived_at IS NULL;

-- 3. Delete policy (own rows)
DROP POLICY IF EXISTS notif_own_delete ON public.notifications;
CREATE POLICY notif_own_delete ON public.notifications
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- 4. notify_tenant_v2 with severity + entity
CREATE OR REPLACE FUNCTION public.notify_tenant_v2(
  _tenant_id uuid,
  _severity text,
  _kind text,
  _title text,
  _body text DEFAULT NULL,
  _link text DEFAULT NULL,
  _entity_type text DEFAULT NULL,
  _entity_id uuid DEFAULT NULL,
  _data jsonb DEFAULT '{}'::jsonb
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE cnt integer;
BEGIN
  INSERT INTO public.notifications
    (tenant_id, user_id, type, severity, title, body, link, entity_type, entity_id, data)
  SELECT _tenant_id, tm.user_id, _kind, _severity, _title, _body, _link, _entity_type, _entity_id, _data
  FROM public.tenant_members tm WHERE tm.tenant_id = _tenant_id;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  RETURN cnt;
END; $$;

GRANT EXECUTE ON FUNCTION public.notify_tenant_v2(uuid,text,text,text,text,text,text,uuid,jsonb) TO authenticated, service_role;

-- 5. Unread count RPC
CREATE OR REPLACE FUNCTION public.unread_notifications_count(_tenant_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COUNT(*)::int FROM public.notifications
  WHERE tenant_id = _tenant_id
    AND user_id = auth.uid()
    AND read_at IS NULL
    AND archived_at IS NULL;
$$;
GRANT EXECUTE ON FUNCTION public.unread_notifications_count(uuid) TO authenticated;

-- 6. Archive / delete RPCs (own rows only)
CREATE OR REPLACE FUNCTION public.archive_notifications(_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cnt integer;
BEGIN
  UPDATE public.notifications SET archived_at = now()
  WHERE id = ANY(_ids) AND user_id = auth.uid() AND archived_at IS NULL;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  RETURN cnt;
END; $$;
GRANT EXECUTE ON FUNCTION public.archive_notifications(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_notifications(_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cnt integer;
BEGIN
  DELETE FROM public.notifications
  WHERE id = ANY(_ids) AND user_id = auth.uid();
  GET DIAGNOSTICS cnt = ROW_COUNT;
  RETURN cnt;
END; $$;
GRANT EXECUTE ON FUNCTION public.delete_notifications(uuid[]) TO authenticated;

-- 7. Trigger: low-stock / out-of-stock on batches
CREATE OR REPLACE FUNCTION public._notif_batch_low_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  reorder numeric;
  pname text;
BEGIN
  IF NEW.qty_on_hand IS NULL OR (OLD.qty_on_hand IS NOT NULL AND NEW.qty_on_hand >= OLD.qty_on_hand) THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(p.reorder_level, 0), p.name INTO reorder, pname
  FROM public.products p WHERE p.id = NEW.product_id;

  IF NEW.qty_on_hand <= 0 AND (OLD.qty_on_hand IS NULL OR OLD.qty_on_hand > 0) THEN
    PERFORM public.notify_tenant_v2(
      NEW.tenant_id, 'error', 'out_of_stock',
      'Out of stock', COALESCE(pname,'Product') || ' batch ' || COALESCE(NEW.batch_no,'') || ' is out of stock.',
      '/inventory/batches', 'batch', NEW.id, '{}'::jsonb
    );
  ELSIF reorder > 0 AND NEW.qty_on_hand <= reorder
        AND (OLD.qty_on_hand IS NULL OR OLD.qty_on_hand > reorder) THEN
    PERFORM public.notify_tenant_v2(
      NEW.tenant_id, 'warning', 'low_stock',
      'Low stock', COALESCE(pname,'Product') || ' batch ' || COALESCE(NEW.batch_no,'') || ' at ' || NEW.qty_on_hand || '.',
      '/inventory/batches', 'batch', NEW.id, '{}'::jsonb
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notif_batch_low_stock ON public.batches;
CREATE TRIGGER trg_notif_batch_low_stock
AFTER UPDATE OF qty_on_hand ON public.batches
FOR EACH ROW EXECUTE FUNCTION public._notif_batch_low_stock();

-- 8. Trigger: security events
CREATE OR REPLACE FUNCTION public._notif_security_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN RETURN NEW; END IF;
  PERFORM public.notify_tenant_v2(
    NEW.tenant_id, 'error', 'security_violation',
    COALESCE(NEW.event_type,'Security event'),
    COALESCE(NEW.description, NEW.event_type),
    '/admin/audit', 'security_event', NEW.id, COALESCE(NEW.metadata,'{}'::jsonb)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notif_security_event ON public.security_events;
CREATE TRIGGER trg_notif_security_event
AFTER INSERT ON public.security_events
FOR EACH ROW EXECUTE FUNCTION public._notif_security_event();

-- 9. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
