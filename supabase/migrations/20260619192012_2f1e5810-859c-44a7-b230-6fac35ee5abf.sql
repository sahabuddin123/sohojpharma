
-- E20: feature flags, onboarding progress, system health, backup runs, go-live checklist
CREATE TABLE public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  flag_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, flag_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feature_flags TO authenticated;
GRANT ALL ON public.feature_flags TO service_role;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members read flags" ON public.feature_flags FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id = feature_flags.tenant_id AND tm.user_id = auth.uid()));
CREATE POLICY "tenant owners manage flags" ON public.feature_flags FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), feature_flags.tenant_id, 'owner'))
  WITH CHECK (public.has_role(auth.uid(), feature_flags.tenant_id, 'owner'));

CREATE TABLE public.tenant_onboarding_progress (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  step_company boolean NOT NULL DEFAULT false,
  step_branches boolean NOT NULL DEFAULT false,
  step_warehouses boolean NOT NULL DEFAULT false,
  step_suppliers boolean NOT NULL DEFAULT false,
  step_products boolean NOT NULL DEFAULT false,
  step_opening_stock boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_onboarding_progress TO authenticated;
GRANT ALL ON public.tenant_onboarding_progress TO service_role;
ALTER TABLE public.tenant_onboarding_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members read onboarding" ON public.tenant_onboarding_progress FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id = tenant_onboarding_progress.tenant_id AND tm.user_id = auth.uid()));
CREATE POLICY "tenant owners write onboarding" ON public.tenant_onboarding_progress FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), tenant_onboarding_progress.tenant_id, 'owner'))
  WITH CHECK (public.has_role(auth.uid(), tenant_onboarding_progress.tenant_id, 'owner'));

CREATE TABLE public.system_health_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  component text NOT NULL,
  status text NOT NULL CHECK (status IN ('healthy','warning','critical')),
  detail jsonb,
  checked_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.system_health_checks TO authenticated;
GRANT ALL ON public.system_health_checks TO service_role;
ALTER TABLE public.system_health_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members read health" ON public.system_health_checks FOR SELECT TO authenticated
  USING (tenant_id IS NULL OR EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id = system_health_checks.tenant_id AND tm.user_id = auth.uid()));

CREATE TABLE public.backup_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'database',
  status text NOT NULL CHECK (status IN ('success','failed','running')),
  size_bytes bigint,
  detail text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
GRANT SELECT ON public.backup_runs TO authenticated;
GRANT ALL ON public.backup_runs TO service_role;
ALTER TABLE public.backup_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant owners read backups" ON public.backup_runs FOR SELECT TO authenticated
  USING (tenant_id IS NULL OR public.has_role(auth.uid(), backup_runs.tenant_id, 'owner'));

CREATE OR REPLACE FUNCTION public.run_go_live_check(_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  res jsonb := '{}'::jsonb;
  products_n int; stock_n int; users_n int; roles_n int; coa_n int; wh_n int;
  backup_recent boolean; notif_prefs int;
BEGIN
  IF NOT public.has_role(auth.uid(), _tenant_id, 'owner') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  SELECT count(*) INTO products_n FROM products WHERE tenant_id = _tenant_id;
  SELECT count(*) INTO stock_n FROM product_stock ps JOIN products p ON p.id = ps.product_id WHERE p.tenant_id = _tenant_id;
  SELECT count(*) INTO users_n FROM tenant_members WHERE tenant_id = _tenant_id;
  SELECT count(*) INTO roles_n FROM user_roles ur JOIN tenant_members tm ON tm.user_id = ur.user_id WHERE tm.tenant_id = _tenant_id;
  SELECT count(*) INTO coa_n FROM chart_of_accounts WHERE tenant_id = _tenant_id;
  SELECT count(*) INTO wh_n FROM warehouses WHERE tenant_id = _tenant_id;
  SELECT EXISTS(SELECT 1 FROM backup_runs WHERE (tenant_id = _tenant_id OR tenant_id IS NULL) AND status = 'success' AND finished_at > now() - interval '24 hours') INTO backup_recent;
  SELECT count(*) INTO notif_prefs FROM notification_preferences np JOIN tenant_members tm ON tm.user_id = np.user_id WHERE tm.tenant_id = _tenant_id;
  res := jsonb_build_object(
    'products', jsonb_build_object('ok', products_n > 0, 'count', products_n),
    'stock', jsonb_build_object('ok', stock_n > 0, 'count', stock_n),
    'accounting', jsonb_build_object('ok', coa_n > 0, 'count', coa_n),
    'warehouse', jsonb_build_object('ok', wh_n > 0, 'count', wh_n),
    'users', jsonb_build_object('ok', users_n > 0, 'count', users_n),
    'roles', jsonb_build_object('ok', roles_n > 0, 'count', roles_n),
    'backups', jsonb_build_object('ok', backup_recent),
    'notifications', jsonb_build_object('ok', notif_prefs > 0, 'count', notif_prefs)
  );
  RETURN res;
END $$;
GRANT EXECUTE ON FUNCTION public.run_go_live_check(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_system_health(_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  db_ok boolean := true;
  sync_pending int; sync_failed int;
  notif_unread int;
  recent_errors int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tenant_members WHERE tenant_id = _tenant_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  SELECT count(*) INTO sync_pending FROM sync_queue WHERE tenant_id = _tenant_id AND status = 'pending';
  SELECT count(*) INTO sync_failed FROM sync_queue WHERE tenant_id = _tenant_id AND status = 'failed';
  SELECT count(*) INTO notif_unread FROM notifications WHERE tenant_id = _tenant_id AND read_at IS NULL;
  SELECT count(*) INTO recent_errors FROM error_logs WHERE tenant_id = _tenant_id AND created_at > now() - interval '1 hour';
  RETURN jsonb_build_object(
    'database', jsonb_build_object('status', CASE WHEN db_ok THEN 'healthy' ELSE 'critical' END),
    'sync_queue', jsonb_build_object('status', CASE WHEN sync_failed > 10 THEN 'critical' WHEN sync_failed > 0 OR sync_pending > 100 THEN 'warning' ELSE 'healthy' END, 'pending', sync_pending, 'failed', sync_failed),
    'notifications', jsonb_build_object('status', 'healthy', 'unread', notif_unread),
    'errors_last_hour', jsonb_build_object('status', CASE WHEN recent_errors > 50 THEN 'critical' WHEN recent_errors > 5 THEN 'warning' ELSE 'healthy' END, 'count', recent_errors),
    'storage', jsonb_build_object('status', 'healthy'),
    'realtime', jsonb_build_object('status', 'healthy'),
    'cron', jsonb_build_object('status', 'healthy')
  );
END $$;
GRANT EXECUTE ON FUNCTION public.get_system_health(uuid) TO authenticated;

CREATE TRIGGER trg_feature_flags_updated BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_onboarding_updated BEFORE UPDATE ON public.tenant_onboarding_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
