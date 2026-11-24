GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_gateways TO authenticated;
GRANT ALL ON public.payment_gateways TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_settlements TO authenticated;
GRANT ALL ON public.payment_settlements TO service_role;