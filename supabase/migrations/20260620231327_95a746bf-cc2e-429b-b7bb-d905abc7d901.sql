
ALTER TABLE public.tenant_settings
  ADD COLUMN IF NOT EXISTS integrations jsonb NOT NULL DEFAULT jsonb_build_object(
    'email_enabled', true,
    'sms_enabled', false,
    'whatsapp_enabled', false,
    'telegram_enabled', false,
    'facebook_pixel_enabled', false,
    'google_analytics_enabled', false,
    'google_drive_enabled', false,
    'webhooks_enabled', true,
    'api_access_enabled', false
  );

CREATE TABLE IF NOT EXISTS public.integration_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  category text NOT NULL,    -- email | sms | whatsapp | telegram | analytics | pixel | drive
  provider text NOT NULL,    -- resend | sendgrid | smtp | mailgun | ses | bulksmsbd | ssl_wireless | mim | twilio | meta | telegram | ga4 | fb_pixel | gdrive | custom
  status text NOT NULL DEFAULT 'inactive',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, category, provider)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_providers TO authenticated;
GRANT ALL ON public.integration_providers TO service_role;
ALTER TABLE public.integration_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "integration_providers_select_member"
  ON public.integration_providers FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tenant_members tm
                 WHERE tm.tenant_id = integration_providers.tenant_id AND tm.user_id = auth.uid()));

CREATE POLICY "integration_providers_write_admin"
  ON public.integration_providers FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), tenant_id, 'owner')
    OR public.has_role(auth.uid(), tenant_id, 'corporate_admin')
    OR public.has_role(auth.uid(), tenant_id, 'manager')
  )
  WITH CHECK (
    public.has_role(auth.uid(), tenant_id, 'owner')
    OR public.has_role(auth.uid(), tenant_id, 'corporate_admin')
    OR public.has_role(auth.uid(), tenant_id, 'manager')
  );

CREATE OR REPLACE FUNCTION public.touch_integration_providers_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;$$;

DROP TRIGGER IF EXISTS trg_integration_providers_touch ON public.integration_providers;
CREATE TRIGGER trg_integration_providers_touch
  BEFORE UPDATE ON public.integration_providers
  FOR EACH ROW EXECUTE FUNCTION public.touch_integration_providers_updated_at();
