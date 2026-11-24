-- E17.2.1: Doctor master linkage on prescriptions
ALTER TABLE public.prescriptions
  ADD COLUMN IF NOT EXISTS doctor_id uuid REFERENCES public.doctors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_prescriptions_doctor_id
  ON public.prescriptions(tenant_id, doctor_id)
  WHERE doctor_id IS NOT NULL;

-- Backfill: try to match free-text doctor_name to existing doctors within the same tenant
UPDATE public.prescriptions p
SET doctor_id = d.id
FROM public.doctors d
WHERE p.doctor_id IS NULL
  AND p.doctor_name IS NOT NULL
  AND d.tenant_id = p.tenant_id
  AND lower(trim(d.full_name)) = lower(trim(p.doctor_name));