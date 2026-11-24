REVOKE EXECUTE ON FUNCTION public.backfill_historical_journals(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.commit_opening_stock(uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reconcile_financials(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_stock_override_allowed(uuid, boolean) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.backfill_historical_journals(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commit_opening_stock(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_financials(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_stock_override_allowed(uuid, boolean) TO authenticated;