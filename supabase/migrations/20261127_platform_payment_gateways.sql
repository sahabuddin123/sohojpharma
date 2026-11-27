-- Migration: Platform-wide Payment Gateway Configuration (bKash Sandbox & Live)
-- Secret columns are strictly restricted to service_role (SuperAdmin server functions only).

CREATE TABLE IF NOT EXISTS public.platform_payment_gateways (
  provider text PRIMARY KEY,
  is_enabled boolean NOT NULL DEFAULT true,
  active_mode text NOT NULL DEFAULT 'live' CHECK (active_mode IN ('sandbox', 'live')),
  checkout_flow text NOT NULL DEFAULT 'checkout' CHECK (checkout_flow IN ('checkout', 'tokenized')),
  merchant_number text,
  gateway_fee_percent numeric(5,2) NOT NULL DEFAULT 1.50,
  sandbox_app_key text,
  sandbox_app_secret text,
  sandbox_username text,
  sandbox_password text,
  sandbox_base_url text,
  live_app_key text,
  live_app_secret text,
  live_username text,
  live_password text,
  live_base_url text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_payment_gateways ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.platform_payment_gateways FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.platform_payment_gateways TO service_role;

INSERT INTO public.platform_payment_gateways (
  provider,
  is_enabled,
  active_mode,
  checkout_flow,
  merchant_number,
  gateway_fee_percent,
  sandbox_base_url,
  live_base_url
)
VALUES (
  'bkash',
  true,
  'live',
  'checkout',
  '01951413828',
  1.50,
  'https://checkout.sandbox.bka.sh/v1.2.0-beta',
  'https://checkout.pay.bka.sh/v1.2.0-beta'
)
ON CONFLICT (provider) DO NOTHING;
