-- Security: default-deny in branch checker; revoke anon EXECUTE on public SECURITY DEFINER fn;
-- rescope every branch_isolation_* policy from public to authenticated.

CREATE OR REPLACE FUNCTION public.user_can_access_branch(_tenant_id uuid, _branch_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  IF public.is_app_admin(auth.uid()) THEN
    RETURN true;
  END IF;
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RETURN false;
  END IF;
  IF _branch_id IS NULL THEN
    RETURN true;
  END IF;
  IF public.is_branch_admin(auth.uid(), _tenant_id) THEN
    RETURN true;
  END IF;
  -- Default deny: require explicit staff branch assignment
  RETURN EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.tenant_id = _tenant_id
      AND s.user_id = auth.uid()
      AND s.branch_id = _branch_id
      AND COALESCE(s.status, 'active') <> 'inactive'
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.prevent_tenant_plan_self_update() FROM PUBLIC, anon;

DO $do$
DECLARE
  t text;
  tables text[] := ARRAY[
    'cash_register_transactions','clinical_audit','customer_payments','expenses',
    'goods_receipt_items','goods_receipts','incomes','journal_lines','party_ledger',
    'prescription_items','prescriptions','purchase_items','purchase_order_items',
    'purchase_orders','purchase_return_items','purchase_returns','purchases',
    'quotation_items','quotations','sale_items','sale_payments','sale_return_items',
    'sales','sales_returns','stock_transfer_items','supplier_payments'
  ];
  select_qual  text := '(public.is_corporate_role(auth.uid(), tenant_id) OR public.has_branch_access(auth.uid(), branch_id))';
  writer_qual  text := '(public.is_corporate_writer(auth.uid(), tenant_id) OR public.has_branch_access(auth.uid(), branch_id))';
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS branch_isolation_select ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS branch_isolation_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS branch_isolation_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS branch_isolation_delete ON public.%I', t);

    EXECUTE format(
      'CREATE POLICY branch_isolation_select ON public.%I AS PERMISSIVE FOR SELECT TO authenticated USING (%s)',
      t, select_qual);
    EXECUTE format(
      'CREATE POLICY branch_isolation_insert ON public.%I AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (%s)',
      t, writer_qual);
    EXECUTE format(
      'CREATE POLICY branch_isolation_update ON public.%I AS PERMISSIVE FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
      t, writer_qual, writer_qual);
    EXECUTE format(
      'CREATE POLICY branch_isolation_delete ON public.%I AS PERMISSIVE FOR DELETE TO authenticated USING (%s)',
      t, writer_qual);
  END LOOP;
END
$do$;