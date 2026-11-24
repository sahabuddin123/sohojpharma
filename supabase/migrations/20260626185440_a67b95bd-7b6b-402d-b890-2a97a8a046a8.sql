CREATE TABLE IF NOT EXISTS public.qz_credentials (
  id smallint PRIMARY KEY DEFAULT 1,
  private_key text,
  certificate text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT qz_credentials_singleton CHECK (id = 1)
);

INSERT INTO public.qz_credentials (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON public.qz_credentials TO authenticated;
GRANT ALL ON public.qz_credentials TO service_role;

ALTER TABLE public.qz_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "qz_credentials_admin_select" ON public.qz_credentials;
CREATE POLICY "qz_credentials_admin_select" ON public.qz_credentials
  FOR SELECT TO authenticated
  USING (public.is_app_admin(auth.uid()));

DROP POLICY IF EXISTS "qz_credentials_admin_write" ON public.qz_credentials;
CREATE POLICY "qz_credentials_admin_write" ON public.qz_credentials
  FOR ALL TO authenticated
  USING (public.is_app_admin(auth.uid()))
  WITH CHECK (public.is_app_admin(auth.uid()));