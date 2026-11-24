
ALTER TABLE public.tenant_settings ADD COLUMN IF NOT EXISTS number_series JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.number_series_counters (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  current_value BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, doc_type)
);

GRANT SELECT ON public.number_series_counters TO authenticated;
GRANT ALL ON public.number_series_counters TO service_role;

ALTER TABLE public.number_series_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read their tenant counters"
  ON public.number_series_counters
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = number_series_counters.tenant_id
        AND tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role manages counters"
  ON public.number_series_counters
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.generate_next_number(_tenant_id UUID, _doc_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg JSONB;
  v_prefix TEXT;
  v_start BIGINT;
  v_next BIGINT;
BEGIN
  IF _tenant_id IS NULL OR _doc_type IS NULL OR _doc_type = '' THEN
    RAISE EXCEPTION 'tenant_id and doc_type required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_tenant_id::text || ':' || _doc_type, 0));

  SELECT (number_series -> _doc_type) INTO v_cfg
  FROM public.tenant_settings WHERE tenant_id = _tenant_id;

  v_prefix := COALESCE(NULLIF(v_cfg ->> 'prefix', ''), UPPER(_doc_type));
  v_start  := COALESCE((v_cfg ->> 'start')::BIGINT, 1000);

  INSERT INTO public.number_series_counters (tenant_id, doc_type, current_value)
  VALUES (_tenant_id, _doc_type, GREATEST(v_start, 1) - 1)
  ON CONFLICT (tenant_id, doc_type) DO NOTHING;

  UPDATE public.number_series_counters
     SET current_value = GREATEST(current_value, v_start - 1) + 1,
         updated_at = now()
   WHERE tenant_id = _tenant_id AND doc_type = _doc_type
  RETURNING current_value INTO v_next;

  RETURN v_prefix || '-' || v_next::text;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_next_number(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_next_number(UUID, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_number_series_counter(_tenant_id UUID, _doc_type TEXT)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(current_value, 0)
  FROM public.number_series_counters
  WHERE tenant_id = _tenant_id AND doc_type = _doc_type;
$$;

GRANT EXECUTE ON FUNCTION public.get_number_series_counter(UUID, TEXT) TO authenticated, service_role;
