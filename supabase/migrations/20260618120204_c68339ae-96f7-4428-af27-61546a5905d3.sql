
ALTER VIEW public.v_trial_balance     SET (security_invoker = on);
ALTER VIEW public.v_general_ledger    SET (security_invoker = on);
ALTER VIEW public.v_balance_sheet     SET (security_invoker = on);
ALTER VIEW public.v_cash_flow         SET (security_invoker = on);
ALTER VIEW public.v_equity_changes    SET (security_invoker = on);
