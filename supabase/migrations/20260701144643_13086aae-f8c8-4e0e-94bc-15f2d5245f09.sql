CREATE OR REPLACE FUNCTION public.list_purchase_requisitions(_tenant_id uuid, _search text DEFAULT NULL::text, _status text DEFAULT NULL::text, _supplier_id uuid DEFAULT NULL::uuid, _warehouse_id uuid DEFAULT NULL::uuid, _date_from date DEFAULT NULL::date, _date_to date DEFAULT NULL::date, _limit integer DEFAULT 50, _offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, pr_number text, requisition_date date, expected_date date, supplier_id uuid, supplier_name text, warehouse_id uuid, warehouse_name text, status text, total_items integer, total_qty numeric, estimated_amount numeric, remarks text, created_by uuid, created_by_email text, created_at timestamp with time zone, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id=_tenant_id AND tm.user_id=auth.uid())
     AND NOT EXISTS (SELECT 1 FROM public.app_admins a WHERE a.user_id=auth.uid()) THEN
    RAISE EXCEPTION 'Not a member of tenant';
  END IF;
  RETURN QUERY
  WITH base AS (
    SELECT pr.*, s.name AS s_name, w.name AS w_name, u.email AS u_email,
           COUNT(*) OVER() AS full_count
    FROM public.purchase_requisitions pr
    LEFT JOIN public.suppliers s   ON s.id = pr.supplier_id
    LEFT JOIN public.warehouses w  ON w.id = pr.warehouse_id
    LEFT JOIN auth.users u         ON u.id = pr.created_by
    WHERE pr.tenant_id = _tenant_id
      AND (_status IS NULL OR pr.status::text = _status)
      AND (_supplier_id IS NULL OR pr.supplier_id = _supplier_id)
      AND (_warehouse_id IS NULL OR pr.warehouse_id = _warehouse_id)
      AND (_date_from IS NULL OR pr.requisition_date >= _date_from)
      AND (_date_to IS NULL OR pr.requisition_date <= _date_to)
      AND (
        _search IS NULL OR _search = '' OR
        pr.pr_number ILIKE '%'||_search||'%' OR
        COALESCE(s.name,'') ILIKE '%'||_search||'%' OR
        EXISTS (
          SELECT 1 FROM public.purchase_requisition_items i
          WHERE i.requisition_id = pr.id
            AND (i.product_name ILIKE '%'||_search||'%'
              OR i.sku ILIKE '%'||_search||'%'
              OR i.barcode ILIKE '%'||_search||'%')
        )
      )
    ORDER BY pr.requisition_date DESC, pr.created_at DESC
    LIMIT _limit OFFSET _offset
  )
  SELECT b.id, b.pr_number, b.requisition_date, b.expected_date,
         b.supplier_id, b.s_name,
         b.warehouse_id, b.w_name,
         b.status::text, b.total_items, b.total_qty, b.estimated_amount,
         b.remarks, b.created_by, b.u_email,
         b.created_at, b.full_count
  FROM base b;
END $function$;

REVOKE EXECUTE ON FUNCTION public.list_purchase_requisitions(uuid, text, text, uuid, uuid, date, date, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_purchase_requisitions(uuid, text, text, uuid, uuid, date, date, integer, integer) TO authenticated;