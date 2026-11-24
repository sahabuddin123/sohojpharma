CREATE OR REPLACE FUNCTION public.backup_table_catalog()
RETURNS TABLE(table_name text, has_tenant_id boolean, has_id boolean, columns jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.relname::text,
    EXISTS (SELECT 1 FROM information_schema.columns ic WHERE ic.table_schema='public' AND ic.table_name=c.relname AND ic.column_name='tenant_id'),
    EXISTS (SELECT 1 FROM information_schema.columns ic WHERE ic.table_schema='public' AND ic.table_name=c.relname AND ic.column_name='id'),
    (SELECT jsonb_agg(jsonb_build_object('name', ic.column_name, 'type', ic.data_type, 'udt', ic.udt_name, 'nullable', ic.is_nullable='YES') ORDER BY ic.ordinal_position)
       FROM information_schema.columns ic WHERE ic.table_schema='public' AND ic.table_name=c.relname)
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p')
  ORDER BY c.relname;
$$;
REVOKE ALL ON FUNCTION public.backup_table_catalog() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backup_table_catalog() TO service_role;