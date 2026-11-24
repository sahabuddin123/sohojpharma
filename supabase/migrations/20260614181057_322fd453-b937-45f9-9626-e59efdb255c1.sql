
ALTER VIEW public.v_stock_on_hand   SET (security_invoker = on);
ALTER VIEW public.v_expiry_alert    SET (security_invoker = on);
ALTER VIEW public.v_low_stock       SET (security_invoker = on);
ALTER VIEW public.v_stock_valuation SET (security_invoker = on);
