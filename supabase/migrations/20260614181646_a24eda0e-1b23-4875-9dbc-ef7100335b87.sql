
-- ============ EXTRA COLUMNS ============
ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS user_role  text,
  ADD COLUMN IF NOT EXISTS branch_id  uuid,
  ADD COLUMN IF NOT EXISTS device     text,
  ADD COLUMN IF NOT EXISTS browser    text,
  ADD COLUMN IF NOT EXISTS session_id text;

-- ============ IMMUTABILITY (block update/delete for normal roles) ============
DROP POLICY IF EXISTS audit_no_update ON public.audit_log;
DROP POLICY IF EXISTS audit_no_delete ON public.audit_log;
CREATE POLICY audit_no_update ON public.audit_log FOR UPDATE TO authenticated USING (false);
CREATE POLICY audit_no_delete ON public.audit_log FOR DELETE TO authenticated USING (false);

-- ============ GENERIC ROW-CHANGE TRIGGER ============
CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant   uuid;
  v_entity   uuid;
  v_action   text;
  v_before   jsonb;
  v_after    jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_after  := to_jsonb(NEW); v_before := NULL;
    v_action := TG_TABLE_NAME || '.create';
    v_entity := (NEW).id; v_tenant := (NEW).tenant_id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_before := to_jsonb(OLD); v_after := to_jsonb(NEW);
    v_action := TG_TABLE_NAME || '.update';
    v_entity := (NEW).id; v_tenant := (NEW).tenant_id;
  ELSE -- DELETE
    v_before := to_jsonb(OLD); v_after := NULL;
    v_action := TG_TABLE_NAME || '.delete';
    v_entity := (OLD).id; v_tenant := (OLD).tenant_id;
  END IF;

  INSERT INTO public.audit_log(
    tenant_id, user_id, action, entity_table, entity_id, before_data, after_data
  ) VALUES (
    v_tenant, auth.uid(), v_action, TG_TABLE_NAME, v_entity, v_before, v_after
  );

  RETURN COALESCE(NEW, OLD);
END $$;

GRANT EXECUTE ON FUNCTION public.audit_row_change() TO authenticated, service_role;

-- ============ ATTACH TRIGGERS ============
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'products','sales','sale_items','purchases','purchase_items',
    'goods_receipts','party_ledger','stock_movements'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%I ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.audit_row_change()', t, t);
  END LOOP;
END $$;

-- ============ APP EVENT LOGGER (login, logout, settings, etc.) ============
CREATE OR REPLACE FUNCTION public.audit_log_event(
  _tenant_id    uuid,
  _action       text,
  _entity_table text DEFAULT NULL,
  _entity_id    uuid DEFAULT NULL,
  _before       jsonb DEFAULT NULL,
  _after        jsonb DEFAULT NULL,
  _ip           inet DEFAULT NULL,
  _user_agent   text DEFAULT NULL,
  _device       text DEFAULT NULL,
  _browser      text DEFAULT NULL,
  _session_id   text DEFAULT NULL,
  _branch_id    uuid DEFAULT NULL,
  _user_role    text DEFAULT NULL
) RETURNS public.audit_log
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE v_row public.audit_log;
BEGIN
  IF _tenant_id IS NOT NULL
     AND NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  INSERT INTO public.audit_log(
    tenant_id, user_id, action, entity_table, entity_id,
    before_data, after_data, ip_address, user_agent,
    device, browser, session_id, branch_id, user_role
  ) VALUES (
    _tenant_id, auth.uid(), _action, _entity_table, _entity_id,
    _before, _after, _ip, _user_agent,
    _device, _browser, _session_id, _branch_id, _user_role
  ) RETURNING * INTO v_row;
  RETURN v_row;
END $$;

REVOKE ALL ON FUNCTION public.audit_log_event(uuid,text,text,uuid,jsonb,jsonb,inet,text,text,text,text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audit_log_event(uuid,text,text,uuid,jsonb,jsonb,inet,text,text,text,text,uuid,text)
  TO authenticated, service_role;

-- ============ RETENTION (service_role only) ============
CREATE OR REPLACE FUNCTION public.audit_purge(_keep_days integer)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  DELETE FROM public.audit_log
   WHERE created_at < now() - make_interval(days => _keep_days);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.audit_purge(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audit_purge(integer) TO service_role;
