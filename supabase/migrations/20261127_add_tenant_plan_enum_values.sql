-- Add modern plan codes to public.tenant_plan enum so tenants.plan matches public.plans.code
ALTER TYPE public.tenant_plan ADD VALUE IF NOT EXISTS 'basic';
ALTER TYPE public.tenant_plan ADD VALUE IF NOT EXISTS 'business';
ALTER TYPE public.tenant_plan ADD VALUE IF NOT EXISTS 'professional';
