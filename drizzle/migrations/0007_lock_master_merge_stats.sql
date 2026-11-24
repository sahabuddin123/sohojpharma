REVOKE EXECUTE ON FUNCTION public.master_merge(text, uuid[], uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.master_stats(text, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.master_merge_server(_kind text, _source_ids uuid[], _target_id uuid, _actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_table text; v_fk_col text; v_tenant uuid;
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
  IF NOT EXISTS (SELECT 1 FROM public.tenant_members WHERE tenant_id = v_tenant AND user_id = _actor) THEN
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

    UPDATE public.import_master_diff SET target_id = _target_id
     WHERE tenant_id = v_tenant AND kind = _kind AND target_id = v_src;

    EXECUTE format('UPDATE public.%I SET aliases = (SELECT array_agg(DISTINCT a) FROM unnest(coalesce(aliases, ARRAY[]::text[]) || ARRAY[$1::text]) a WHERE a IS NOT NULL AND a <> '''') WHERE id = $2', v_table)
      USING (v_snapshot->>'name'), _target_id;

    EXECUTE format('UPDATE public.%I SET deleted_at = now(), deleted_by = $1, status = ''deleted'' WHERE id = $2 AND tenant_id = $3', v_table)
      USING _actor, v_src, v_tenant;

    INSERT INTO public.master_merge_history(tenant_id, master_kind, source_id, target_id, source_snapshot, affected_rows, merged_by)
    VALUES (v_tenant, _kind, v_src, _target_id, v_snapshot, v_subtotal, _actor);

    INSERT INTO public.master_audit_log(tenant_id, master_kind, master_id, action, before, after, actor)
    VALUES (v_tenant, _kind, v_src, 'merge', v_snapshot, jsonb_build_object('merged_into', _target_id), _actor);
  END LOOP;

  RETURN jsonb_build_object('affected_products', v_affected, 'merged_sources', cardinality(_source_ids));
END;
$function$;

CREATE OR REPLACE FUNCTION public.master_stats_server(_kind text, _tenant uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
  EXECUTE format('WITH base AS (SELECT * FROM public.%I WHERE tenant_id = $1), dupe AS (SELECT lower(name) n, count(*) c FROM base WHERE deleted_at IS NULL GROUP BY 1 HAVING count(*) > 1) SELECT jsonb_build_object(''total'', (SELECT count(*) FROM base WHERE deleted_at IS NULL), ''active'', (SELECT count(*) FROM base WHERE deleted_at IS NULL AND coalesce(status,''active'') = ''active''), ''inactive'', (SELECT count(*) FROM base WHERE deleted_at IS NULL AND coalesce(status,''active'') <> ''active''), ''deleted'', (SELECT count(*) FROM base WHERE deleted_at IS NOT NULL), ''duplicates'', (SELECT coalesce(sum(c),0) FROM dupe))', v_table)
    INTO v_result USING _tenant;
  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.master_merge_server(text, uuid[], uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.master_stats_server(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.master_merge_server(text, uuid[], uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.master_stats_server(text, uuid) TO service_role;