
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS payment_terms_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS area text,
  ADD COLUMN IF NOT EXISTS district text,
  ADD COLUMN IF NOT EXISTS division text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS blood_group text,
  ADD COLUMN IF NOT EXISTS chronic_diseases text,
  ADD COLUMN IF NOT EXISTS doctor_reference text,
  ADD COLUMN IF NOT EXISTS nid_passport text,
  ADD COLUMN IF NOT EXISTS notes text;
