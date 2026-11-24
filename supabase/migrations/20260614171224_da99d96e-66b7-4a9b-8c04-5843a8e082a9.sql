DROP INDEX IF EXISTS public.idx_products_name_trgm;
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO authenticated, service_role, anon;
CREATE INDEX idx_products_name_trgm ON public.products USING gin (name extensions.gin_trgm_ops);