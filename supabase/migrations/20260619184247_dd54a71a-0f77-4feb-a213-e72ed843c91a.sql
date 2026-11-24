-- E17.3 — Fulfillment + Refill Intelligence schema

-- 1) Fulfillment tracking on prescriptions
ALTER TABLE public.prescriptions
  ADD COLUMN IF NOT EXISTS fulfillment_status text NOT NULL DEFAULT 'new'
    CHECK (fulfillment_status IN ('new','reviewed','fulfilled','partially_fulfilled','cancelled')),
  ADD COLUMN IF NOT EXISTS fulfilled_by uuid,
  ADD COLUMN IF NOT EXISTS fulfilled_at timestamptz,
  ADD COLUMN IF NOT EXISTS fulfilled_sale_id uuid,
  ADD COLUMN IF NOT EXISTS expected_refill_date date,
  ADD COLUMN IF NOT EXISTS refill_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS confidence_score numeric,
  ADD COLUMN IF NOT EXISTS unmatched_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_prescriptions_fulfillment
  ON public.prescriptions (tenant_id, fulfillment_status);
CREATE INDEX IF NOT EXISTS idx_prescriptions_refill_due
  ON public.prescriptions (tenant_id, expected_refill_date)
  WHERE fulfillment_status IN ('fulfilled','partially_fulfilled');

-- 2) Per-item fulfilled qty
ALTER TABLE public.prescription_items
  ADD COLUMN IF NOT EXISTS fulfilled_qty numeric NOT NULL DEFAULT 0;

-- 3) prescription_refills — history of refill events and reminders
CREATE TABLE IF NOT EXISTS public.prescription_refills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  prescription_id uuid NOT NULL REFERENCES public.prescriptions(id) ON DELETE CASCADE,
  customer_id uuid,
  expected_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','due','notified','completed','skipped')),
  notified_at timestamptz,
  completed_at timestamptz,
  completed_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prescription_refills TO authenticated;
GRANT ALL ON public.prescription_refills TO service_role;

ALTER TABLE public.prescription_refills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members read refills"
  ON public.prescription_refills FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));

CREATE POLICY "Tenant members write refills"
  ON public.prescription_refills FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_refills_due
  ON public.prescription_refills (tenant_id, expected_date, status);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_refills_touch ON public.prescription_refills;
CREATE TRIGGER trg_refills_touch BEFORE UPDATE ON public.prescription_refills
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();