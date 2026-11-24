
-- 1) Backfill into every existing tenant
INSERT INTO public.chart_of_accounts(tenant_id, code, name, type, is_system)
SELECT t.id, v.code, v.name, v.type::public.account_type, true
FROM public.tenants t
CROSS JOIN (VALUES
  ('1040','Rocket Wallet','asset'),
  ('1050','Card Clearing Account','asset'),
  ('3100','Opening Stock Equity','equity'),
  ('4050','Sales Return','income'),
  ('4090','Discount Allowed','income'),
  ('5090','Discount Received','cogs')
) AS v(code,name,type)
ON CONFLICT (tenant_id, code) DO NOTHING;

-- 2) Update seed function so new tenants get the full chart
CREATE OR REPLACE FUNCTION public.seed_default_chart(_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.chart_of_accounts(tenant_id, code, name, type, is_system) VALUES
    (_tenant_id,'1000','Cash on Hand','asset',true),
    (_tenant_id,'1010','Bank Account','asset',true),
    (_tenant_id,'1020','bKash','asset',true),
    (_tenant_id,'1030','Nagad','asset',true),
    (_tenant_id,'1040','Rocket Wallet','asset',true),
    (_tenant_id,'1050','Card Clearing Account','asset',true),
    (_tenant_id,'1100','Accounts Receivable','asset',true),
    (_tenant_id,'1200','Inventory','asset',true),
    (_tenant_id,'2000','Accounts Payable','liability',true),
    (_tenant_id,'2100','Output VAT Payable','liability',true),
    (_tenant_id,'2200','Input VAT Receivable','asset',true),
    (_tenant_id,'3000','Owner Equity','equity',true),
    (_tenant_id,'3100','Opening Stock Equity','equity',true),
    (_tenant_id,'4000','Sales Revenue','income',true),
    (_tenant_id,'4050','Sales Return','income',true),
    (_tenant_id,'4090','Discount Allowed','income',true),
    (_tenant_id,'4100','Other Income','income',true),
    (_tenant_id,'5000','Cost of Goods Sold','cogs',true),
    (_tenant_id,'5090','Discount Received','cogs',true),
    (_tenant_id,'6000','Salary Expense','expense',true),
    (_tenant_id,'6100','Rent Expense','expense',true),
    (_tenant_id,'6200','Utilities Expense','expense',true),
    (_tenant_id,'6300','Marketing Expense','expense',true),
    (_tenant_id,'6900','Miscellaneous Expense','expense',true)
  ON CONFLICT (tenant_id, code) DO NOTHING;
END $function$;
