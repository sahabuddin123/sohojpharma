CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_master_row()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_name text; v_code text;
BEGIN
  v_name := btrim(regexp_replace(coalesce(NEW.name, ''), '\s+', ' ', 'g'));
  IF v_name = '' THEN RAISE EXCEPTION 'Master name cannot be empty'; END IF;
  IF v_name ~ '[\x00-\x1F\x7F]' THEN RAISE EXCEPTION 'Master name contains invalid control characters'; END IF;
  NEW.name := v_name;
  BEGIN
    v_code := (to_jsonb(NEW) ->> 'code');
    IF v_code IS NULL OR btrim(v_code) = '' THEN
      v_code := btrim(lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g')), '-');
      IF length(v_code) > 40 THEN v_code := substr(v_code, 1, 40); END IF;
      NEW := jsonb_populate_record(NEW, jsonb_build_object('code', v_code));
    END IF;
  EXCEPTION WHEN undefined_column THEN NULL; END;
  RETURN NEW;
END;
$$;

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS deleted_by uuid,
  ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS deleted_by uuid,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

ALTER TABLE public.manufacturers       ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.generics            ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.medicine_types      ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.dosage_forms        ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.therapeutic_classes ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.countries           ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.tax_classes         ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.generics    ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE public.countries   ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE public.tax_classes ADD COLUMN IF NOT EXISTS code text;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'manufacturers','generics','categories','units','medicine_types',
    'dosage_forms','therapeutic_classes','countries','tax_classes'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_set_updated_at', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t || '_set_updated_at', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_normalize', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.normalize_master_row()', t || '_normalize', t);
  END LOOP;
END$$;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'manufacturers','generics','categories','units','medicine_types',
    'dosage_forms','therapeutic_classes','countries','tax_classes'
  ] LOOP
    EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I (tenant_id, lower(name)) WHERE deleted_at IS NULL', t || '_name_uniq_ci', t);
    EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I (tenant_id, lower(code)) WHERE code IS NOT NULL AND deleted_at IS NULL', t || '_code_uniq_ci', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I USING gin (name gin_trgm_ops)', t || '_name_trgm', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id, status) WHERE deleted_at IS NULL', t || '_tenant_status', t);
  END LOOP;
END$$;

CREATE TABLE IF NOT EXISTS public.master_audit_log (
  id          bigserial PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  master_kind text NOT NULL,
  master_id   uuid,
  action      text NOT NULL CHECK (action IN ('create','update','delete','restore','merge','bulk_update','import')),
  before      jsonb,
  after       jsonb,
  actor       uuid,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS master_audit_log_tenant_kind_idx ON public.master_audit_log (tenant_id, master_kind, occurred_at DESC);
CREATE INDEX IF NOT EXISTS master_audit_log_master_idx ON public.master_audit_log (master_id);

GRANT SELECT ON public.master_audit_log TO authenticated;
GRANT ALL    ON public.master_audit_log TO service_role;
ALTER TABLE public.master_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit log tenant read" ON public.master_audit_log;
CREATE POLICY "audit log tenant read"
  ON public.master_audit_log FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id = master_audit_log.tenant_id AND tm.user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.master_merge_history (
  id              bigserial PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  master_kind     text NOT NULL,
  source_id       uuid NOT NULL,
  target_id       uuid NOT NULL,
  source_snapshot jsonb,
  affected_rows   integer NOT NULL DEFAULT 0,
  merged_by       uuid,
  merged_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS master_merge_history_tenant_idx ON public.master_merge_history (tenant_id, master_kind, merged_at DESC);

GRANT SELECT ON public.master_merge_history TO authenticated;
GRANT ALL    ON public.master_merge_history TO service_role;
ALTER TABLE public.master_merge_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "merge history tenant read" ON public.master_merge_history;
CREATE POLICY "merge history tenant read"
  ON public.master_merge_history FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id = master_merge_history.tenant_id AND tm.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.master_merge(_kind text, _source_ids uuid[], _target_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_table text; v_fk_col text; v_tenant uuid;
  v_actor uuid := auth.uid();
  v_affected int := 0; v_subtotal int;
  v_src uuid; v_snapshot jsonb;
BEGIN
  CASE _kind
    WHEN 'manufacturer'      THEN v_table := 'manufacturers';       v_fk_col := 'manufacturer_id';
    WHEN 'generic'           THEN v_table := 'generics';            v_fk_col := 'generic_id';
    WHEN 'category'          THEN v_table := 'categories';          v_fk_col := 'category_id';
    WHEN 'unit'              THEN v_table := 'units';               v_fk_col := 'unit_id';
    WHEN 'medicine_type'     THEN v_table := 'medicine_types';      v_fk_col := 'medicine_type_id';
    WHEN 'dosage_form'       THEN v_table := 'dosage_forms';        v_fk_col := 'dosage_form_id';
    WHEN 'therapeutic_class' THEN v_table := 'therapeutic_classes'; v_fk_col := 'therapeutic_class_id';
    WHEN 'country'           THEN v_table := 'countries';           v_fk_col := 'country_id';
    WHEN 'tax_class'         THEN v_table := 'tax_classes';         v_fk_col := 'tax_class_id';
    ELSE RAISE EXCEPTION 'Unknown master kind: %', _kind;
  END CASE;

  EXECUTE format('SELECT tenant_id FROM public.%I WHERE id = $1', v_table) INTO v_tenant USING _target_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Target master row not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenant_members WHERE tenant_id = v_tenant AND user_id = v_actor) THEN
    RAISE EXCEPTION 'Not a member of target tenant';
  END IF;

  FOREACH v_src IN ARRAY _source_ids LOOP
    IF v_src = _target_id THEN CONTINUE; END IF;
    EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id = $1 AND tenant_id = $2', v_table)
      INTO v_snapshot USING v_src, v_tenant;
    IF v_snapshot IS NULL THEN CONTINUE; END IF;

    EXECUTE format('UPDATE public.products SET %I = $1 WHERE %I = $2 AND tenant_id = $3', v_fk_col, v_fk_col)
      USING _target_id, v_src, v_tenant;
    GET DIAGNOSTICS v_subtotal = ROW_COUNT;
    v_affected := v_affected + v_subtotal;

    UPDATE public.import_master_diff
       SET target_id = _target_id
     WHERE tenant_id = v_tenant AND kind = _kind AND target_id = v_src;

    EXECUTE format('UPDATE public.%I SET aliases = (SELECT array_agg(DISTINCT a) FROM unnest(coalesce(aliases, ARRAY[]::text[]) || ARRAY[$1::text]) a WHERE a IS NOT NULL AND a <> '''') WHERE id = $2', v_table)
      USING (v_snapshot->>'name'), _target_id;

    EXECUTE format('UPDATE public.%I SET deleted_at = now(), deleted_by = $1, status = ''deleted'' WHERE id = $2', v_table)
      USING v_actor, v_src;

    INSERT INTO public.master_merge_history(tenant_id, master_kind, source_id, target_id, source_snapshot, affected_rows, merged_by)
    VALUES (v_tenant, _kind, v_src, _target_id, v_snapshot, v_subtotal, v_actor);

    INSERT INTO public.master_audit_log(tenant_id, master_kind, master_id, action, before, after, actor)
    VALUES (v_tenant, _kind, v_src, 'merge', v_snapshot, jsonb_build_object('merged_into', _target_id), v_actor);
  END LOOP;

  RETURN jsonb_build_object('affected_products', v_affected, 'merged_sources', cardinality(_source_ids));
END;
$$;

REVOKE ALL ON FUNCTION public.master_merge(text, uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.master_merge(text, uuid[], uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.master_stats(_kind text, _tenant uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_table text; v_result jsonb;
BEGIN
  CASE _kind
    WHEN 'manufacturer'      THEN v_table := 'manufacturers';
    WHEN 'generic'           THEN v_table := 'generics';
    WHEN 'category'          THEN v_table := 'categories';
    WHEN 'unit'              THEN v_table := 'units';
    WHEN 'medicine_type'     THEN v_table := 'medicine_types';
    WHEN 'dosage_form'       THEN v_table := 'dosage_forms';
    WHEN 'therapeutic_class' THEN v_table := 'therapeutic_classes';
    WHEN 'country'           THEN v_table := 'countries';
    WHEN 'tax_class'         THEN v_table := 'tax_classes';
    ELSE RAISE EXCEPTION 'Unknown master kind: %', _kind;
  END CASE;

  IF NOT EXISTS (SELECT 1 FROM public.tenant_members WHERE tenant_id = _tenant AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not a member of tenant';
  END IF;

  EXECUTE format('WITH base AS (SELECT * FROM public.%I WHERE tenant_id = $1), dupe AS (SELECT lower(name) n, count(*) c FROM base WHERE deleted_at IS NULL GROUP BY 1 HAVING count(*) > 1) SELECT jsonb_build_object(''total'', (SELECT count(*) FROM base WHERE deleted_at IS NULL), ''active'', (SELECT count(*) FROM base WHERE deleted_at IS NULL AND coalesce(status,''active'') = ''active''), ''inactive'', (SELECT count(*) FROM base WHERE deleted_at IS NULL AND coalesce(status,''active'') <> ''active''), ''deleted'', (SELECT count(*) FROM base WHERE deleted_at IS NOT NULL), ''duplicates'', (SELECT coalesce(sum(c),0) FROM dupe))', v_table)
    INTO v_result USING _tenant;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.master_stats(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.master_stats(text, uuid) TO authenticated;