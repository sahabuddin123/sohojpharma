-- Revoke EXECUTE from anon/authenticated on internal trigger & admin-only SECURITY DEFINER functions.
-- These run as triggers or are invoked server-side only.
REVOKE EXECUTE ON FUNCTION public.audit_purge(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.test_tenant_isolation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_default_chart(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_tenant(uuid, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_tenant_violation(uuid, text, text, inet, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_row_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_user_limit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_product_limit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.journal_assert_balanced() FROM PUBLIC, anon, authenticated;