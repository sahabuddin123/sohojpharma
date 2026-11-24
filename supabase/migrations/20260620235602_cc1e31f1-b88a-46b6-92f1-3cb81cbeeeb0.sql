
ALTER TABLE public.tenant_settings
  ADD COLUMN IF NOT EXISTS customer jsonb NOT NULL DEFAULT '{
    "loyalty_enabled": true,
    "points_per_taka": 1,
    "minimum_purchase": 100,
    "maximum_points_per_sale": 500,
    "credit_control_enabled": true,
    "birthday_wishes_enabled": true,
    "anniversary_wishes_enabled": true,
    "due_reminders_enabled": true,
    "credit_warn_pct": 80
  }'::jsonb;

CREATE TABLE IF NOT EXISTS public.customer_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  channel text NOT NULL DEFAULT 'in_app',
  segment text NOT NULL DEFAULT 'all',
  message text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  scheduled_at timestamptz,
  sent_at timestamptz,
  recipient_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_campaigns_tenant ON public.customer_campaigns(tenant_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_campaigns TO authenticated;
GRANT ALL ON public.customer_campaigns TO service_role;
ALTER TABLE public.customer_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaigns_tenant_all" ON public.customer_campaigns
  FOR ALL USING (is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (is_tenant_member(auth.uid(), tenant_id));
