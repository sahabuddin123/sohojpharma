-- Enable full module access on paid plans (accounting, crm, prescription, mobile app)
UPDATE public.plans
SET features = COALESCE(features, '{}'::jsonb) || jsonb_build_object(
  'pos', true, 'inventory', true, 'purchase', true, 'sales', true,
  'crm', true, 'accounting', true, 'prescription', true, 'mobile_app', true
)
WHERE name IN ('Professional','Enterprise','Starter');

-- Free plan: keep core modules plus basic accounting
UPDATE public.plans
SET features = COALESCE(features, '{}'::jsonb) || jsonb_build_object(
  'pos', true, 'inventory', true, 'purchase', true, 'sales', true,
  'crm', true, 'accounting', true
)
WHERE name = 'Free';