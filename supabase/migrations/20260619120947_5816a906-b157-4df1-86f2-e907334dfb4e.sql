
ALTER TABLE public.product_import_logs DROP CONSTRAINT IF EXISTS product_import_logs_import_batch_id_key;
CREATE INDEX IF NOT EXISTS idx_product_import_logs_batch ON public.product_import_logs(import_batch_id) WHERE import_batch_id IS NOT NULL;
