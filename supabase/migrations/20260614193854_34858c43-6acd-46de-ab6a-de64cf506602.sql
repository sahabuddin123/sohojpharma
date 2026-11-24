
CREATE OR REPLACE FUNCTION public.compute_vat(
  _amount numeric, _rate numeric, _mode text DEFAULT 'exclusive'
) RETURNS TABLE(net numeric, vat numeric, gross numeric)
LANGUAGE sql IMMUTABLE
SET search_path = public AS $$
  SELECT
    CASE WHEN _mode='none' OR COALESCE(_rate,0)=0 THEN _amount
         WHEN _mode='inclusive' THEN ROUND(_amount / (1 + _rate/100.0), 4)
         ELSE _amount END,
    CASE WHEN _mode='none' OR COALESCE(_rate,0)=0 THEN 0
         WHEN _mode='inclusive' THEN ROUND(_amount - _amount/(1 + _rate/100.0), 4)
         ELSE ROUND(_amount * _rate/100.0, 4) END,
    CASE WHEN _mode='none' OR COALESCE(_rate,0)=0 THEN _amount
         WHEN _mode='inclusive' THEN _amount
         ELSE ROUND(_amount * (1 + _rate/100.0), 4) END;
$$;
