
CREATE TABLE IF NOT EXISTS public.tenant_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  branding jsonb NOT NULL DEFAULT '{}'::jsonb,
  business_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  pos jsonb NOT NULL DEFAULT '{}'::jsonb,
  inventory jsonb NOT NULL DEFAULT '{}'::jsonb,
  clinical jsonb NOT NULL DEFAULT '{}'::jsonb,
  reports jsonb NOT NULL DEFAULT '{}'::jsonb,
  system jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.tenant_settings TO authenticated;
GRANT ALL ON public.tenant_settings TO service_role;

ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view tenant settings"
ON public.tenant_settings FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.tenant_members tm
  WHERE tm.tenant_id = tenant_settings.tenant_id AND tm.user_id = auth.uid()
));

CREATE POLICY "Owners and admins can insert tenant settings"
ON public.tenant_settings FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), tenant_id, 'owner')
  OR public.has_role(auth.uid(), tenant_id, 'corporate_admin')
);

CREATE POLICY "Owners and admins can update tenant settings"
ON public.tenant_settings FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), tenant_id, 'owner')
  OR public.has_role(auth.uid(), tenant_id, 'corporate_admin')
)
WITH CHECK (
  public.has_role(auth.uid(), tenant_id, 'owner')
  OR public.has_role(auth.uid(), tenant_id, 'corporate_admin')
);

CREATE OR REPLACE FUNCTION public.tenant_settings_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_tenant_settings_updated_at ON public.tenant_settings;
CREATE TRIGGER trg_tenant_settings_updated_at
BEFORE UPDATE ON public.tenant_settings
FOR EACH ROW EXECUTE FUNCTION public.tenant_settings_set_updated_at();
