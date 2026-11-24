
DO $$
DECLARE
  t_id uuid := 'af4c03a7-be73-498e-9f49-e0f8c87a57b0';
BEGIN
  SET LOCAL session_replication_role = 'replica';

  DELETE FROM public.journal_lines       WHERE tenant_id = t_id;
  DELETE FROM public.journal_entries     WHERE tenant_id = t_id;

  DELETE FROM public.sale_payments       WHERE tenant_id = t_id;
  DELETE FROM public.sale_return_items   WHERE tenant_id = t_id;
  DELETE FROM public.sales_returns       WHERE tenant_id = t_id;
  DELETE FROM public.sale_items          WHERE tenant_id = t_id;
  DELETE FROM public.sale_tax_audit      WHERE tenant_id = t_id;
  DELETE FROM public.held_sales          WHERE tenant_id = t_id;
  DELETE FROM public.sales               WHERE tenant_id = t_id;
  DELETE FROM public.customer_payments   WHERE tenant_id = t_id;

  DELETE FROM public.purchase_return_items WHERE tenant_id = t_id;
  DELETE FROM public.purchase_returns      WHERE tenant_id = t_id;
  DELETE FROM public.purchase_items        WHERE tenant_id = t_id;
  DELETE FROM public.purchases             WHERE tenant_id = t_id;
  DELETE FROM public.goods_receipt_items   WHERE tenant_id = t_id;
  DELETE FROM public.goods_receipts        WHERE tenant_id = t_id;
  DELETE FROM public.purchase_order_items  WHERE tenant_id = t_id;
  DELETE FROM public.purchase_orders       WHERE tenant_id = t_id;
  DELETE FROM public.supplier_payments     WHERE tenant_id = t_id;

  DELETE FROM public.quotation_items     WHERE tenant_id = t_id;
  DELETE FROM public.quotations          WHERE tenant_id = t_id;

  DELETE FROM public.prescription_items  WHERE tenant_id = t_id;
  DELETE FROM public.prescription_refills WHERE tenant_id = t_id;
  DELETE FROM public.prescription_ocr_jobs WHERE tenant_id = t_id;
  DELETE FROM public.prescriptions       WHERE tenant_id = t_id;

  DELETE FROM public.requisition_items   WHERE tenant_id = t_id;
  DELETE FROM public.requisition_records WHERE tenant_id = t_id;
  DELETE FROM public.requisitions        WHERE tenant_id = t_id;
  DELETE FROM public.stock_transfer_items WHERE tenant_id = t_id;
  DELETE FROM public.stock_transfers     WHERE tenant_id = t_id;

  DELETE FROM public.stock_movements     WHERE tenant_id = t_id;
  DELETE FROM public.inventory_revaluation_log WHERE tenant_id = t_id;
  DELETE FROM public.batch_recalls       WHERE tenant_id = t_id;
  DELETE FROM public.batches             WHERE tenant_id = t_id;

  DELETE FROM public.party_ledger        WHERE tenant_id = t_id;
  DELETE FROM public.customer_loyalty_points WHERE tenant_id = t_id;
  DELETE FROM public.customer_points     WHERE tenant_id = t_id;
  DELETE FROM public.customer_prices     WHERE tenant_id = t_id;
  DELETE FROM public.customer_reminders  WHERE tenant_id = t_id;
  DELETE FROM public.customer_campaigns  WHERE tenant_id = t_id;

  DELETE FROM public.cash_register_transactions WHERE tenant_id = t_id;

  DELETE FROM public.import_errors_v2    WHERE tenant_id = t_id;
  DELETE FROM public.import_master_diff  WHERE tenant_id = t_id;
  DELETE FROM public.import_staging_rows WHERE tenant_id = t_id;
  DELETE FROM public.import_jobs_v2      WHERE tenant_id = t_id;
  DELETE FROM public.import_jobs         WHERE tenant_id = t_id;
  DELETE FROM public.import_mappings     WHERE tenant_id = t_id;
  DELETE FROM public.import_audit        WHERE tenant_id = t_id;
  DELETE FROM public.product_import_errors WHERE tenant_id = t_id;
  DELETE FROM public.product_import_logs   WHERE tenant_id = t_id;

  DELETE FROM public.invoice_print_logs  WHERE tenant_id = t_id;
  DELETE FROM public.invoice_share_logs  WHERE tenant_id = t_id;
  DELETE FROM public.invoice_edit_history WHERE tenant_id = t_id;

  DELETE FROM public.product_barcodes    WHERE tenant_id = t_id;
  DELETE FROM public.products            WHERE tenant_id = t_id;

  DELETE FROM public.audit_log           WHERE tenant_id = t_id;
  DELETE FROM public.clinical_audit      WHERE tenant_id = t_id;
  DELETE FROM public.master_audit_log    WHERE tenant_id = t_id;

  DELETE FROM public.notifications       WHERE tenant_id = t_id;
  DELETE FROM public.notification_events WHERE tenant_id = t_id;
  DELETE FROM public.executive_alerts    WHERE tenant_id = t_id;
  DELETE FROM public.financial_drift_log WHERE tenant_id = t_id;

  RAISE NOTICE 'STORE RESET COMPLETED for tenant %', t_id;
END $$;
