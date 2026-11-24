-- Landing CMS singleton table
CREATE TABLE IF NOT EXISTS public.landing_cms (
  id INTEGER PRIMARY KEY DEFAULT 1,
  content_en JSONB NOT NULL DEFAULT '{}'::jsonb,
  content_bn JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  CONSTRAINT landing_cms_singleton CHECK (id = 1)
);

GRANT SELECT ON public.landing_cms TO anon, authenticated;
GRANT ALL ON public.landing_cms TO service_role;

ALTER TABLE public.landing_cms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "landing_cms_public_read" ON public.landing_cms;
CREATE POLICY "landing_cms_public_read" ON public.landing_cms
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "landing_cms_admin_write" ON public.landing_cms;
CREATE POLICY "landing_cms_admin_write" ON public.landing_cms
  FOR ALL TO authenticated
  USING (public.is_app_admin(auth.uid()))
  WITH CHECK (public.is_app_admin(auth.uid()));

-- Insert empty placeholder row (will be filled by seed after migration)
INSERT INTO public.landing_cms (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Public read RPC
CREATE OR REPLACE FUNCTION public.get_landing_cms()
RETURNS TABLE(content_en jsonb, content_bn jsonb, updated_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT content_en, content_bn, updated_at FROM public.landing_cms WHERE id = 1;
$fn$;

REVOKE ALL ON FUNCTION public.get_landing_cms() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_landing_cms() TO anon, authenticated;

-- Admin update RPC
CREATE OR REPLACE FUNCTION public.update_landing_cms(_content_en jsonb, _content_bn jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.is_app_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: app admin only';
  END IF;
  UPDATE public.landing_cms
    SET content_en = _content_en,
        content_bn = _content_bn,
        updated_at = now(),
        updated_by = auth.uid()
    WHERE id = 1;
END;
$fn$;

REVOKE ALL ON FUNCTION public.update_landing_cms(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_landing_cms(jsonb, jsonb) TO authenticated;