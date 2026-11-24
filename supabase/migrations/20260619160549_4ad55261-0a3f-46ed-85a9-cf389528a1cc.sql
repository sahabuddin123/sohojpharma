
-- 1) Revoke anon EXECUTE on SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.get_inventory_overview(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_opening_stock_products(uuid, text, text, integer, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.merge_product_duplicates(uuid, uuid, uuid[]) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.products_friendly_duplicate_check() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.scan_product_duplicates(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.search_products(uuid, text, uuid, integer) FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_inventory_overview(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_opening_stock_products(uuid, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_product_duplicates(uuid, uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.products_friendly_duplicate_check() TO authenticated;
GRANT EXECUTE ON FUNCTION public.scan_product_duplicates(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_products(uuid, text, uuid, integer) TO authenticated;

-- 2) drug_interactions: authenticated-only
DROP POLICY IF EXISTS di_read_all ON public.drug_interactions;
REVOKE SELECT ON public.drug_interactions FROM anon;
CREATE POLICY di_read_auth ON public.drug_interactions
  FOR SELECT TO authenticated USING (true);

-- 3) tenant_branding: add anon SELECT policy for pre-login pages
GRANT SELECT ON public.tenant_branding TO anon;
DROP POLICY IF EXISTS tb_anon_read ON public.tenant_branding;
CREATE POLICY tb_anon_read ON public.tenant_branding
  FOR SELECT TO anon USING (true);

-- 4) comm_log: allow app admins to read rows with NULL tenant_id
DROP POLICY IF EXISTS comm_log_admin_null_read ON public.comm_log;
CREATE POLICY comm_log_admin_null_read ON public.comm_log
  FOR SELECT TO authenticated
  USING (tenant_id IS NULL AND public.is_app_admin(auth.uid()));
