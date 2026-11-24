ALTER TABLE public.tenant_number_sequences
  ADD COLUMN IF NOT EXISTS last_value bigint;

DO $$
DECLARE
  r record;
  v_last bigint;
BEGIN
  FOR r IN SELECT tenant_id, doc_type, sequence_name, start_value FROM public.tenant_number_sequences LOOP
    BEGIN
      EXECUTE format('SELECT last_value FROM public.%I', r.sequence_name) INTO v_last;
    EXCEPTION WHEN undefined_table THEN
      v_last := r.start_value - 1;
    END;
    UPDATE public.tenant_number_sequences
       SET last_value = GREATEST(v_last, r.start_value - 1)
     WHERE tenant_id = r.tenant_id AND doc_type = r.doc_type;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_next_number(_tenant_id uuid, _doc_type text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cfg jsonb;
  v_prefix text;
  v_start bigint;
  v_seq_name text;
  v_next bigint;
BEGIN
  IF _tenant_id IS NULL OR COALESCE(_doc_type, '') = '' THEN
    RAISE EXCEPTION 'tenant_id and doc_type required';
  END IF;
  IF _doc_type !~ '^[a-z][a-z0-9_]{0,39}$' THEN
    RAISE EXCEPTION 'invalid doc_type';
  END IF;
  IF auth.uid() IS NOT NULL
     AND NOT public.is_tenant_member(auth.uid(), _tenant_id)
     AND NOT public.is_app_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT number_series -> _doc_type INTO v_cfg
    FROM public.tenant_settings WHERE tenant_id = _tenant_id;
  v_prefix := COALESCE(NULLIF(v_cfg ->> 'prefix', ''), UPPER(_doc_type));
  v_start := GREATEST(COALESCE((v_cfg ->> 'start')::bigint, 1000), 1);
  v_seq_name := 'seq_' || replace(_tenant_id::text, '-', '') || '_' || _doc_type;

  INSERT INTO public.tenant_number_sequences(
    tenant_id, doc_type, sequence_name, prefix, start_value, last_value
  ) VALUES (
    _tenant_id, _doc_type, v_seq_name, v_prefix, v_start, v_start - 1
  ) ON CONFLICT (tenant_id, doc_type) DO NOTHING;

  UPDATE public.tenant_number_sequences
     SET last_value = GREATEST(COALESCE(last_value, start_value - 1), start_value - 1) + 1
   WHERE tenant_id = _tenant_id AND doc_type = _doc_type
  RETURNING prefix, last_value INTO v_prefix, v_next;

  RETURN v_prefix || '-' || v_next::text;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_branch_null_readiness() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_branch_null_readiness() TO service_role;
REVOKE ALL ON FUNCTION public.test_tenant_isolation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.test_tenant_isolation() TO service_role;
REVOKE ALL ON FUNCTION public.generate_next_number(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_next_number(uuid, text) TO authenticated, service_role;