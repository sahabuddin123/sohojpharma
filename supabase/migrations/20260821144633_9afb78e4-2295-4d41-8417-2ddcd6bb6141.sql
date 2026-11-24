ALTER TABLE public.products DISABLE TRIGGER USER;
DO $$
DECLARE v_t uuid; v_b uuid;
BEGIN
  SELECT id INTO v_t FROM public.tenants WHERE lower(name)='nimel pharma' LIMIT 1;
  SELECT id INTO v_b FROM public.branches WHERE tenant_id=v_t AND deleted_at IS NULL LIMIT 1;
  PERFORM public.provision_catalog_for_tenant(v_t, v_b, 12000);
END $$;
ALTER TABLE public.products ENABLE TRIGGER USER;