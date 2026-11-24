
-- C3: Loyalty Points + Customer Reminders
CREATE TABLE IF NOT EXISTS public.customer_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  points_earned numeric NOT NULL DEFAULT 0,
  points_used numeric NOT NULL DEFAULT 0,
  balance numeric NOT NULL DEFAULT 0,
  expiry_date date,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_points_tenant_customer ON public.customer_points(tenant_id, customer_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_points TO authenticated;
GRANT ALL ON public.customer_points TO service_role;
ALTER TABLE public.customer_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cp_tenant_all" ON public.customer_points
  FOR ALL USING (is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (is_tenant_member(auth.uid(), tenant_id));

CREATE TABLE IF NOT EXISTS public.customer_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  reminder_type text NOT NULL,            -- due_7, due_15, due_30, due_60, birthday, anniversary
  channel text NOT NULL DEFAULT 'in_app', -- in_app, sms, whatsapp, email
  status text NOT NULL DEFAULT 'sent',    -- sent, failed
  due_days integer,
  amount numeric,
  message text,
  payload jsonb,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_reminders_tenant ON public.customer_reminders(tenant_id, customer_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_reminders_dedupe ON public.customer_reminders(tenant_id, customer_id, reminder_type, sent_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_reminders TO authenticated;
GRANT ALL ON public.customer_reminders TO service_role;
ALTER TABLE public.customer_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cr_tenant_all" ON public.customer_reminders
  FOR ALL USING (is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (is_tenant_member(auth.uid(), tenant_id));

-- Optional birthday/anniversary fields on customers
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS anniversary date;
