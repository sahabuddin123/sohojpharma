ALTER TABLE public.products DISABLE TRIGGER USER;
WITH src AS (
  SELECT p.global_medicine_id gm,
         max(p.retail_price) rp,
         max(p.purchase_price) pp
  FROM public.products p
  JOIN public.tenants t ON t.id = p.tenant_id
  WHERE p.deleted_at IS NULL
    AND p.global_medicine_id IS NOT NULL
    AND lower(t.name) <> 'nimel pharma'
    AND coalesce(p.retail_price,0) > 0
  GROUP BY p.global_medicine_id
)
UPDATE public.products np
SET retail_price = src.rp,
    purchase_price = CASE WHEN coalesce(src.pp,0) > 0 THEN src.pp ELSE np.purchase_price END
FROM src, public.tenants t
WHERE np.tenant_id = t.id
  AND lower(t.name) = 'nimel pharma'
  AND np.global_medicine_id = src.gm
  AND coalesce(np.retail_price,0) = 0;
ALTER TABLE public.products ENABLE TRIGGER USER;