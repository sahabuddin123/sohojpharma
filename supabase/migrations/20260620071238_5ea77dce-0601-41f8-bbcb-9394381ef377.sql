
CREATE POLICY error_logs_admin_null_read ON public.error_logs
  FOR SELECT TO authenticated
  USING (tenant_id IS NULL AND public.is_app_admin(auth.uid()));

CREATE POLICY job_failures_admin_null_read ON public.job_failures
  FOR SELECT TO authenticated
  USING (tenant_id IS NULL AND public.is_app_admin(auth.uid()));

CREATE POLICY sec_events_admin_null_read ON public.security_events
  FOR SELECT TO authenticated
  USING (tenant_id IS NULL AND public.is_app_admin(auth.uid()));

DO $$ BEGIN
  DROP POLICY IF EXISTS "tenant members can subscribe to notifications channel" ON realtime.messages;
  CREATE POLICY "users subscribe to own notifications channel" ON realtime.messages
    FOR SELECT TO authenticated
    USING (
      topic LIKE 'notifications:%:%'
      AND split_part(topic, ':', 3) = auth.uid()::text
      AND EXISTS (
        SELECT 1 FROM public.tenant_members tm
        WHERE tm.user_id = auth.uid()
          AND tm.tenant_id::text = split_part(topic, ':', 2)
      )
    );
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, service_role;
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

REVOKE EXECUTE ON FUNCTION public._notif_batch_low_stock() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public._notif_security_event() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.archive_notifications(uuid[]) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.backfill_journal_warehouse(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_access_warehouse(uuid, uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.delete_notifications(uuid[]) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_system_health(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.notify_tenant_v2(uuid, text, text, text, text, text, text, uuid, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.run_go_live_check(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.search_products(uuid, text, uuid, integer, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.stock_transfer_approve(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.stock_transfer_receive(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.stock_transfer_reject(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.stock_transfer_request(uuid, uuid, uuid, jsonb, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.unread_notifications_count(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.warehouse_kpis(uuid, uuid) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.archive_notifications(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_journal_warehouse(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_warehouse(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_notifications(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_system_health(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_tenant_v2(uuid, text, text, text, text, text, text, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_go_live_check(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_products(uuid, text, uuid, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stock_transfer_approve(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stock_transfer_receive(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stock_transfer_reject(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stock_transfer_request(uuid, uuid, uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unread_notifications_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.warehouse_kpis(uuid, uuid) TO authenticated;
