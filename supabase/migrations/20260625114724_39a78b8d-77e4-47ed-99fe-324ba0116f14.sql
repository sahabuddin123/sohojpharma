ALTER TABLE public.tenants ALTER COLUMN allow_stock_override SET DEFAULT true;
UPDATE public.tenants SET allow_stock_override = true WHERE allow_stock_override IS DISTINCT FROM true;