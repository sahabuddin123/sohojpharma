
DROP POLICY IF EXISTS "service inserts alerts" ON public.executive_alerts;
CREATE POLICY "tenant members insert alerts" ON public.executive_alerts
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.user_id = auth.uid() AND tm.tenant_id = executive_alerts.tenant_id));
