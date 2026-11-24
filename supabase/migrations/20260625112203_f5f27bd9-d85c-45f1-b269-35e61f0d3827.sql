GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.generics TO authenticated;
GRANT ALL ON public.generics TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.manufacturers TO authenticated;
GRANT ALL ON public.manufacturers TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.batches TO authenticated;
GRANT ALL ON public.batches TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_companies TO authenticated;
GRANT ALL ON public.product_companies TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_generics TO authenticated;
GRANT ALL ON public.product_generics TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_categories TO authenticated;
GRANT ALL ON public.product_categories TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_units TO authenticated;
GRANT ALL ON public.product_units TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_batches TO authenticated;
GRANT ALL ON public.product_batches TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_barcodes TO authenticated;
GRANT ALL ON public.product_barcodes TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_stock TO authenticated;
GRANT ALL ON public.product_stock TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_import_logs TO authenticated;
GRANT ALL ON public.product_import_logs TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_import_errors TO authenticated;
GRANT ALL ON public.product_import_errors TO service_role;