DO $$
DECLARE t uuid := 'f1c63c79-32cf-4eed-b6cd-d6160184f18e';
BEGIN
  DELETE FROM public.stock_movements WHERE tenant_id = t;
  DELETE FROM public.batches WHERE tenant_id = t;
  DELETE FROM public.product_barcodes WHERE product_id IN (SELECT id FROM public.products WHERE tenant_id = t);
  DELETE FROM public.products WHERE tenant_id = t;
END $$;