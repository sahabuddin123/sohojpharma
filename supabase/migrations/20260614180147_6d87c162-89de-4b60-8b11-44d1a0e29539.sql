ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS allergies text;

ALTER TABLE public.prescription_items
  ADD COLUMN IF NOT EXISTS frequency text,
  ADD COLUMN IF NOT EXISTS duration_days integer,
  ADD COLUMN IF NOT EXISTS interpreted_notes text;

ALTER TABLE public.prescriptions
  ADD COLUMN IF NOT EXISTS ai_summary text;