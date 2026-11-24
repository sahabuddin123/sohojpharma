
DROP FUNCTION IF EXISTS public.search_medicines CASCADE;
DROP FUNCTION IF EXISTS public.clinical_safety_check CASCADE;
DROP FUNCTION IF EXISTS public.create_product_from_medicine CASCADE;
DROP FUNCTION IF EXISTS public.bulk_link_local_products CASCADE;
DROP FUNCTION IF EXISTS public.unified_medicine_search(uuid, text, integer) CASCADE;
DROP FUNCTION IF EXISTS public.unified_medicine_search CASCADE;

DROP VIEW IF EXISTS public.v_inventory_by_branch CASCADE;
DROP VIEW IF EXISTS public.v_low_stock_by_branch CASCADE;

DROP TABLE IF EXISTS public.medicine_master CASCADE;
DROP TABLE IF EXISTS public.medicine_alternatives CASCADE;
DROP TABLE IF EXISTS public.product_stock CASCADE;
DROP TABLE IF EXISTS public.product_batches CASCADE;

CREATE VIEW public.v_inventory_by_branch AS
SELECT
  b.tenant_id,
  b.branch_id,
  b.product_id,
  SUM(b.qty_on_hand)::numeric AS qty_on_hand,
  MAX(p.reorder_level)::int   AS reorder_level
FROM public.batches b
JOIN public.products p ON p.id = b.product_id
WHERE b.deleted_at IS NULL AND p.deleted_at IS NULL
GROUP BY b.tenant_id, b.branch_id, b.product_id;

CREATE VIEW public.v_low_stock_by_branch AS
SELECT * FROM public.v_inventory_by_branch WHERE qty_on_hand <= reorder_level;

GRANT SELECT ON public.v_inventory_by_branch TO authenticated;
GRANT SELECT ON public.v_low_stock_by_branch TO authenticated;
GRANT ALL    ON public.v_inventory_by_branch TO service_role;
GRANT ALL    ON public.v_low_stock_by_branch TO service_role;

CREATE FUNCTION public.unified_medicine_search(_tenant uuid, _q text, _limit integer DEFAULT 25)
RETURNS TABLE(
  result_type text, product_id uuid, brand_name text, generic_name text,
  manufacturer_name text, strength text, dosage_form text,
  prescription_required boolean, already_in_stock boolean, score real
)
LANGUAGE sql STABLE
SET search_path TO 'public', 'extensions'
AS $$
  SELECT
    'in_catalog'::text,
    p.id,
    p.name,
    g.name,
    m.name,
    p.strength,
    COALESCE(df.name, p.medicine_type),
    COALESCE(p.is_prescription_required, false),
    EXISTS (
      SELECT 1 FROM public.batches b
      WHERE b.product_id = p.id AND b.tenant_id = _tenant
        AND b.deleted_at IS NULL AND COALESCE(b.qty_on_hand,0) > 0
    ),
    1.0::real
  FROM public.products p
  LEFT JOIN public.generics       g  ON g.id  = p.generic_id
  LEFT JOIN public.manufacturers  m  ON m.id  = p.manufacturer_id
  LEFT JOIN public.dosage_forms   df ON df.id = p.dosage_form_id
  WHERE p.tenant_id = _tenant
    AND p.deleted_at IS NULL
    AND (p.name ILIKE _q || '%' OR p.sku ILIKE _q || '%')
  ORDER BY p.name
  LIMIT _limit;
$$;

REVOKE EXECUTE ON FUNCTION public.unified_medicine_search(uuid, text, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.unified_medicine_search(uuid, text, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.branch_dashboard_metrics(_tenant uuid, _branch uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_wh uuid[];
  v_today_sales numeric := 0; v_today_paid numeric := 0; v_today_due numeric := 0;
  v_today_purchase numeric := 0; v_gross numeric := 0; v_net numeric := 0;
  v_customers int := 0; v_suppliers int := 0; v_inventory numeric := 0;
  v_low int := 0; v_oos int := 0; v_expiring int := 0;
  v_trend7 jsonb := '[]'::jsonb; v_trend30 jsonb := '[]'::jsonb;
  v_top_meds jsonb := '[]'::jsonb; v_top_cats jsonb := '[]'::jsonb;
  v_top_customers jsonb := '[]'::jsonb; v_top_cashiers jsonb := '[]'::jsonb;
begin
  if not exists (select 1 from tenant_members where tenant_id = _tenant and user_id = auth.uid()) then
    raise exception 'Forbidden';
  end if;

  select coalesce(array_agg(id), array[]::uuid[]) into v_wh
  from warehouses where tenant_id = _tenant and branch_id = _branch and deleted_at is null;

  select coalesce(sum(total),0), coalesce(sum(paid),0), coalesce(sum(due),0)
    into v_today_sales, v_today_paid, v_today_due
  from sales
  where tenant_id = _tenant and is_return = false and status::text = 'completed'
    and warehouse_id = any(v_wh) and sale_date::date = v_today;

  select coalesce(sum(total),0) into v_today_purchase
  from purchases where tenant_id = _tenant and is_return = false and purchase_date::date = v_today;

  select coalesce(sum(si.line_total - si.unit_cost * si.qty),0) into v_gross
  from sale_items si
  join sales s on s.id = si.sale_id and s.tenant_id = si.tenant_id
  where si.tenant_id = _tenant and s.is_return = false and s.status::text = 'completed'
    and s.warehouse_id = any(v_wh) and s.sale_date::date = v_today;
  v_net := v_gross;

  select count(*) into v_customers from customers where tenant_id = _tenant and is_active = true;
  select count(*) into v_suppliers from suppliers where tenant_id = _tenant;

  select coalesce(sum(b.qty_on_hand * coalesce(b.purchase_price, 0)), 0) into v_inventory
  from batches b where b.tenant_id = _tenant and b.branch_id = _branch and b.deleted_at is null;

  with agg as (
    select b.product_id, sum(b.qty_on_hand) as qty
    from batches b
    where b.tenant_id = _tenant and b.branch_id = _branch and b.deleted_at is null
    group by b.product_id
  )
  select count(*) filter (where a.qty > 0 and a.qty <= p.reorder_level),
         count(*) filter (where a.qty <= 0)
  into v_low, v_oos
  from agg a join products p on p.id = a.product_id
  where p.tenant_id = _tenant and p.deleted_at is null;

  select count(*) into v_expiring
  from batches
  where tenant_id = _tenant and branch_id = _branch and deleted_at is null
    and qty_on_hand > 0 and expiry_date is not null
    and expiry_date between v_today and v_today + 30;

  select coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'sales', coalesce(amt,0)) order by d), '[]'::jsonb)
  into v_trend7
  from generate_series(v_today - 6, v_today, interval '1 day') d
  left join lateral (select sum(total) as amt from sales
    where tenant_id = _tenant and is_return = false and status::text = 'completed'
      and warehouse_id = any(v_wh) and sale_date::date = d::date) s on true;

  select coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'sales', coalesce(amt,0)) order by d), '[]'::jsonb)
  into v_trend30
  from generate_series(v_today - 29, v_today, interval '1 day') d
  left join lateral (select sum(total) as amt from sales
    where tenant_id = _tenant and is_return = false and status::text = 'completed'
      and warehouse_id = any(v_wh) and sale_date::date = d::date) s on true;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_top_meds from (
    select p.name, sum(si.qty)::numeric as qty, sum(si.line_total)::numeric as revenue
    from sale_items si join sales s on s.id = si.sale_id
    join products p on p.id = si.product_id
    where si.tenant_id = _tenant and s.is_return=false and s.status::text='completed'
      and s.warehouse_id = any(v_wh) and s.sale_date >= v_today - 29
    group by p.name order by revenue desc limit 10
  ) t;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_top_cats from (
    select coalesce(c.name,'Uncategorized') as name, sum(si.line_total)::numeric as revenue
    from sale_items si join sales s on s.id = si.sale_id
    join products p on p.id = si.product_id
    left join categories c on c.id = p.category_id
    where si.tenant_id = _tenant and s.is_return=false and s.status::text='completed'
      and s.warehouse_id = any(v_wh) and s.sale_date >= v_today - 29
    group by c.name order by revenue desc limit 10
  ) t;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_top_customers from (
    select coalesce(c.name,'Walk-in') as name, sum(s.total)::numeric as revenue
    from sales s left join customers c on c.id = s.customer_id
    where s.tenant_id = _tenant and s.is_return=false and s.status::text='completed'
      and s.warehouse_id = any(v_wh) and s.sale_date >= v_today - 29
    group by c.name order by revenue desc limit 10
  ) t;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_top_cashiers from (
    select coalesce(p.full_name,'Unknown') as name, count(*) as invoices, sum(s.total)::numeric as revenue
    from sales s left join profiles p on p.id = s.cashier_id
    where s.tenant_id = _tenant and s.is_return=false and s.status::text='completed'
      and s.warehouse_id = any(v_wh) and s.sale_date >= v_today - 29
    group by p.full_name order by revenue desc limit 10
  ) t;

  return jsonb_build_object(
    'kpi', jsonb_build_object(
      'todaySales', v_today_sales, 'todayPurchase', v_today_purchase,
      'grossProfit', v_gross, 'netProfit', v_net,
      'cashCollection', v_today_paid, 'dueCollection', v_today_due,
      'totalCustomers', v_customers, 'totalSuppliers', v_suppliers,
      'inventoryValue', v_inventory, 'expiring30', v_expiring,
      'lowStock', v_low, 'outOfStock', v_oos),
    'trend7', v_trend7, 'trend30', v_trend30,
    'topMedicines', v_top_meds, 'topCategories', v_top_cats,
    'topCustomers', v_top_customers, 'topCashiers', v_top_cashiers);
end;
$function$;

CREATE OR REPLACE FUNCTION public.corporate_dashboard_metrics(_tenant uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_total_sales numeric := 0; v_total_purchase numeric := 0; v_total_profit numeric := 0;
  v_total_inventory numeric := 0; v_total_due numeric := 0; v_total_collections numeric := 0;
  v_active_customers int := 0; v_active_suppliers int := 0;
  v_branch_compare jsonb := '[]'::jsonb;
  v_low_monitor jsonb := '[]'::jsonb;
  v_expiry_monitor jsonb := '[]'::jsonb;
begin
  if not (
    public.has_role(auth.uid(), _tenant, 'owner'::app_role)
    or public.has_role(auth.uid(), _tenant, 'corporate_admin'::app_role)
  ) then
    raise exception 'Forbidden: owner or corporate_admin required';
  end if;

  select coalesce(sum(total),0), coalesce(sum(paid),0), coalesce(sum(due),0)
    into v_total_sales, v_total_collections, v_total_due
  from sales where tenant_id = _tenant and is_return=false and status::text='completed'
    and sale_date >= v_today - 29;

  select coalesce(sum(total),0) into v_total_purchase
  from purchases where tenant_id = _tenant and is_return=false and purchase_date >= v_today - 29;

  select coalesce(sum(si.line_total - si.unit_cost*si.qty),0) into v_total_profit
  from sale_items si join sales s on s.id=si.sale_id
  where si.tenant_id = _tenant and s.is_return=false and s.status::text='completed'
    and s.sale_date >= v_today - 29;

  select coalesce(sum(b.qty_on_hand * coalesce(b.purchase_price,0)), 0) into v_total_inventory
  from batches b where b.tenant_id = _tenant and b.deleted_at is null;

  select count(*) into v_active_customers from customers where tenant_id = _tenant and is_active = true;
  select count(*) into v_active_suppliers from suppliers where tenant_id = _tenant;

  select coalesce(jsonb_agg(row_to_json(t) order by t.sales desc), '[]'::jsonb) into v_branch_compare from (
    select br.id as branch_id, br.name as branch_name, br.branch_role,
      coalesce((select sum(s.total) from sales s join warehouses w on w.id = s.warehouse_id
        where s.tenant_id = _tenant and w.branch_id = br.id and s.is_return=false
          and s.status::text='completed' and s.sale_date >= v_today - 29),0)::numeric as sales,
      coalesce((select sum(si.line_total - si.unit_cost*si.qty) from sale_items si
        join sales s on s.id=si.sale_id join warehouses w on w.id = s.warehouse_id
        where si.tenant_id = _tenant and w.branch_id = br.id and s.is_return=false
          and s.status::text='completed' and s.sale_date >= v_today - 29),0)::numeric as profit,
      coalesce((select sum(s.paid) from sales s join warehouses w on w.id = s.warehouse_id
        where s.tenant_id = _tenant and w.branch_id = br.id and s.is_return=false
          and s.status::text='completed' and s.sale_date >= v_today - 29),0)::numeric as collections,
      coalesce((select sum(b.qty_on_hand * coalesce(b.purchase_price,0)) from batches b
        where b.tenant_id = _tenant and b.branch_id = br.id and b.deleted_at is null),0)::numeric as inventory_value
    from branches br
    where br.tenant_id = _tenant and br.deleted_at is null and br.is_active = true
  ) t;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_low_monitor from (
    select p.name as product, br.name as branch, agg.qty as qty, p.reorder_level as reorder
    from (select b.product_id, b.branch_id, sum(b.qty_on_hand) as qty from batches b
          where b.tenant_id = _tenant and b.deleted_at is null
          group by b.product_id, b.branch_id) agg
    join products p on p.id = agg.product_id
    left join branches br on br.id = agg.branch_id
    where p.tenant_id = _tenant and p.deleted_at is null and agg.qty <= p.reorder_level
    order by (p.reorder_level - agg.qty) desc limit 50
  ) t;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_expiry_monitor from (
    select p.name as product, br.name as branch, b.batch_no, b.expiry_date, b.qty_on_hand,
      case when b.expiry_date < v_today then 'expired'
           when b.expiry_date <= v_today + 7 then '7d'
           when b.expiry_date <= v_today + 30 then '30d'
           else '90d' end as bucket
    from batches b join products p on p.id = b.product_id
    left join branches br on br.id = b.branch_id
    where b.tenant_id = _tenant and b.deleted_at is null
      and b.qty_on_hand > 0 and b.expiry_date is not null
      and b.expiry_date <= v_today + 90
    order by b.expiry_date asc limit 100
  ) t;

  return jsonb_build_object(
    'kpi', jsonb_build_object(
      'totalSales', v_total_sales, 'totalPurchase', v_total_purchase,
      'totalProfit', v_total_profit, 'totalInventory', v_total_inventory,
      'totalDue', v_total_due, 'totalCollections', v_total_collections,
      'activeCustomers', v_active_customers, 'activeSuppliers', v_active_suppliers),
    'branches', v_branch_compare,
    'lowStock', v_low_monitor,
    'expiry', v_expiry_monitor);
end;
$function$;

CREATE OR REPLACE FUNCTION public.run_go_live_check(_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  res jsonb := '{}'::jsonb;
  products_n int; stock_n int; users_n int; roles_n int; coa_n int; wh_n int;
  backup_recent boolean; notif_prefs int;
BEGIN
  IF NOT public.has_role(auth.uid(), _tenant_id, 'owner') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  SELECT count(*) INTO products_n FROM products WHERE tenant_id = _tenant_id AND deleted_at IS NULL;
  SELECT count(*) INTO stock_n FROM batches b JOIN products p ON p.id = b.product_id
    WHERE p.tenant_id = _tenant_id AND b.deleted_at IS NULL AND b.qty_on_hand > 0;
  SELECT count(*) INTO users_n FROM tenant_members WHERE tenant_id = _tenant_id;
  SELECT count(*) INTO roles_n FROM user_roles ur JOIN tenant_members tm ON tm.user_id = ur.user_id WHERE tm.tenant_id = _tenant_id;
  SELECT count(*) INTO coa_n FROM chart_of_accounts WHERE tenant_id = _tenant_id;
  SELECT count(*) INTO wh_n FROM warehouses WHERE tenant_id = _tenant_id;
  SELECT EXISTS(SELECT 1 FROM backup_runs WHERE (tenant_id = _tenant_id OR tenant_id IS NULL) AND status = 'success' AND finished_at > now() - interval '24 hours') INTO backup_recent;
  SELECT count(*) INTO notif_prefs FROM notification_preferences np JOIN tenant_members tm ON tm.user_id = np.user_id WHERE tm.tenant_id = _tenant_id;
  res := jsonb_build_object(
    'products', jsonb_build_object('ok', products_n > 0, 'count', products_n),
    'stock', jsonb_build_object('ok', stock_n > 0, 'count', stock_n),
    'accounting', jsonb_build_object('ok', coa_n > 0, 'count', coa_n),
    'warehouse', jsonb_build_object('ok', wh_n > 0, 'count', wh_n),
    'users', jsonb_build_object('ok', users_n > 0, 'count', users_n),
    'roles', jsonb_build_object('ok', roles_n > 0, 'count', roles_n),
    'backups', jsonb_build_object('ok', backup_recent),
    'notifications', jsonb_build_object('ok', notif_prefs > 0, 'count', notif_prefs)
  );
  RETURN res;
END $function$;

REVOKE EXECUTE ON FUNCTION public.branch_dashboard_metrics(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.corporate_dashboard_metrics(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.run_go_live_check(uuid) FROM anon;
