
-- =========================================================================
-- Phase 11.1 Hardening: H1 RLS + H4 SECURITY DEFINER lockdown + M7 indexes
-- =========================================================================

-- ---------- H1: Replace permissive policies ------------------------------

-- leads: keep public submission, but enforce input shape (no more WITH CHECK true)
DROP POLICY IF EXISTS "Anyone can submit a lead" ON public.leads;
CREATE POLICY "Public can submit a lead with validated shape"
  ON public.leads
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    char_length(btrim(name))  BETWEEN 1 AND 200
    AND char_length(btrim(email)) BETWEEN 3 AND 320
    AND email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    AND char_length(coalesce(phone,''))   <= 50
    AND char_length(coalesce(company,'')) <= 200
    AND char_length(coalesce(message,'')) <= 4000
    AND status = 'new'
  );

-- comm_log: service_role bypasses RLS already, so the `ALL USING(true)` policy is
-- redundant and confuses the linter. Drop it. authenticated read policy stays.
DROP POLICY IF EXISTS "service role manages comm_log" ON public.comm_log;

-- ---------- H4: Lock SECURITY DEFINER functions to authenticated only ----
-- Trigger-only functions stay GRANTed only to roles that fire the trigger.
-- App-callable functions: REVOKE from anon/public, GRANT to authenticated.

DO $$
DECLARE
  r record;
  sig text;
BEGIN
  FOR r IN
    SELECT p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.prosecdef = true
      -- Skip trigger-return functions (no app callers, EXECUTE comes from triggers)
      AND pg_get_function_result(p.oid) <> 'trigger'
  LOOP
    sig := format('public.%I(%s)', r.proname, r.args);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon',   sig);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO authenticated', sig);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO service_role',  sig);
  END LOOP;
END $$;

-- ---------- M7: tenant_id indexes on 19 base tables ----------------------
CREATE INDEX IF NOT EXISTS idx_goods_receipt_items_tenant     ON public.goods_receipt_items   (tenant_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_tenant    ON public.purchase_order_items  (tenant_id);
CREATE INDEX IF NOT EXISTS idx_purchase_return_items_tenant   ON public.purchase_return_items (tenant_id);
CREATE INDEX IF NOT EXISTS idx_quotation_items_tenant         ON public.quotation_items       (tenant_id);
CREATE INDEX IF NOT EXISTS idx_requisition_items_tenant       ON public.requisition_items     (tenant_id);
CREATE INDEX IF NOT EXISTS idx_sale_return_items_tenant       ON public.sale_return_items     (tenant_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_tenant    ON public.stock_transfer_items  (tenant_id);
CREATE INDEX IF NOT EXISTS idx_prescription_items_tenant      ON public.prescription_items    (tenant_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_tenant           ON public.journal_lines         (tenant_id);
CREATE INDEX IF NOT EXISTS idx_customer_loyalty_points_tenant ON public.customer_loyalty_points(tenant_id);
CREATE INDEX IF NOT EXISTS idx_franchises_tenant              ON public.franchises            (tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoice_print_logs_tenant      ON public.invoice_print_logs    (tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoice_share_logs_tenant      ON public.invoice_share_logs    (tenant_id);
CREATE INDEX IF NOT EXISTS idx_product_import_errors_tenant   ON public.product_import_errors (tenant_id);
CREATE INDEX IF NOT EXISTS idx_product_import_logs_tenant     ON public.product_import_logs   (tenant_id);
CREATE INDEX IF NOT EXISTS idx_shifts_tenant                  ON public.shifts                (tenant_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_tenant         ON public.support_tickets       (tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_tenant              ON public.user_roles            (tenant_id);
CREATE INDEX IF NOT EXISTS idx_announcements_tenant           ON public.announcements         (tenant_id);
