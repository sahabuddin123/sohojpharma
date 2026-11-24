
create or replace function public.branch_dashboard_metrics(_tenant uuid, _branch uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_wh uuid[];
  v_today_sales numeric := 0;
  v_today_paid numeric := 0;
  v_today_due numeric := 0;
  v_today_purchase numeric := 0;
  v_gross numeric := 0;
  v_net numeric := 0;
  v_customers int := 0;
  v_suppliers int := 0;
  v_inventory numeric := 0;
  v_low int := 0;
  v_oos int := 0;
  v_expiring int := 0;
  v_trend7 jsonb := '[]'::jsonb;
  v_trend30 jsonb := '[]'::jsonb;
  v_top_meds jsonb := '[]'::jsonb;
  v_top_cats jsonb := '[]'::jsonb;
  v_top_customers jsonb := '[]'::jsonb;
  v_top_cashiers jsonb := '[]'::jsonb;
begin
  if not exists (select 1 from tenant_members where tenant_id = _tenant and user_id = auth.uid()) then
    raise exception 'Forbidden';
  end if;

  select coalesce(array_agg(id), array[]::uuid[]) into v_wh
  from warehouses
  where tenant_id = _tenant and branch_id = _branch and deleted_at is null;

  select coalesce(sum(total),0), coalesce(sum(paid),0), coalesce(sum(due),0)
    into v_today_sales, v_today_paid, v_today_due
  from sales
  where tenant_id = _tenant and is_return = false and status::text = 'completed'
    and warehouse_id = any(v_wh) and sale_date::date = v_today;

  select coalesce(sum(total),0) into v_today_purchase
  from purchases
  where tenant_id = _tenant and is_return = false and purchase_date::date = v_today;

  select coalesce(sum(si.line_total - si.unit_cost * si.qty),0) into v_gross
  from sale_items si
  join sales s on s.id = si.sale_id and s.tenant_id = si.tenant_id
  where si.tenant_id = _tenant and s.is_return = false and s.status::text = 'completed'
    and s.warehouse_id = any(v_wh) and s.sale_date::date = v_today;
  v_net := v_gross;

  select count(*) into v_customers from customers where tenant_id = _tenant and is_active = true;
  select count(*) into v_suppliers from suppliers where tenant_id = _tenant;

  select coalesce(sum(ps.qty_on_hand * coalesce(pb.purchase_price,0)),0)
  into v_inventory
  from product_stock ps
  left join product_batches pb on pb.id = ps.batch_id
  where ps.tenant_id = _tenant and ps.branch_id = _branch and ps.deleted_at is null;

  select
    count(*) filter (where ps.qty_on_hand > 0 and ps.qty_on_hand <= ps.reorder_level),
    count(*) filter (where ps.qty_on_hand <= 0)
  into v_low, v_oos
  from product_stock ps
  where ps.tenant_id = _tenant and ps.branch_id = _branch and ps.deleted_at is null;

  select count(*) into v_expiring
  from product_batches
  where tenant_id = _tenant and branch_id = _branch and deleted_at is null
    and qty_on_hand > 0 and expiry_date is not null
    and expiry_date between v_today and v_today + 30;

  select coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'sales', coalesce(amt,0)) order by d), '[]'::jsonb)
  into v_trend7
  from generate_series(v_today - 6, v_today, interval '1 day') d
  left join lateral (
    select sum(total) as amt from sales
    where tenant_id = _tenant and is_return = false and status::text = 'completed'
      and warehouse_id = any(v_wh) and sale_date::date = d::date
  ) s on true;

  select coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'sales', coalesce(amt,0)) order by d), '[]'::jsonb)
  into v_trend30
  from generate_series(v_today - 29, v_today, interval '1 day') d
  left join lateral (
    select sum(total) as amt from sales
    where tenant_id = _tenant and is_return = false and status::text = 'completed'
      and warehouse_id = any(v_wh) and sale_date::date = d::date
  ) s on true;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_top_meds from (
    select p.name, sum(si.qty)::numeric as qty, sum(si.line_total)::numeric as revenue
    from sale_items si
    join sales s on s.id = si.sale_id
    join products p on p.id = si.product_id
    where si.tenant_id = _tenant and s.is_return=false and s.status::text='completed'
      and s.warehouse_id = any(v_wh) and s.sale_date >= v_today - 29
    group by p.name order by revenue desc limit 10
  ) t;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_top_cats from (
    select coalesce(c.name,'Uncategorized') as name, sum(si.line_total)::numeric as revenue
    from sale_items si
    join sales s on s.id = si.sale_id
    join products p on p.id = si.product_id
    left join categories c on c.id = p.category_id
    where si.tenant_id = _tenant and s.is_return=false and s.status::text='completed'
      and s.warehouse_id = any(v_wh) and s.sale_date >= v_today - 29
    group by c.name order by revenue desc limit 10
  ) t;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_top_customers from (
    select coalesce(c.name,'Walk-in') as name, sum(s.total)::numeric as revenue
    from sales s
    left join customers c on c.id = s.customer_id
    where s.tenant_id = _tenant and s.is_return=false and s.status::text='completed'
      and s.warehouse_id = any(v_wh) and s.sale_date >= v_today - 29
    group by c.name order by revenue desc limit 10
  ) t;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_top_cashiers from (
    select coalesce(p.full_name,'Unknown') as name, count(*) as invoices, sum(s.total)::numeric as revenue
    from sales s
    left join profiles p on p.id = s.cashier_id
    where s.tenant_id = _tenant and s.is_return=false and s.status::text='completed'
      and s.warehouse_id = any(v_wh) and s.sale_date >= v_today - 29
    group by p.full_name order by revenue desc limit 10
  ) t;

  return jsonb_build_object(
    'kpi', jsonb_build_object(
      'todaySales', v_today_sales,
      'todayPurchase', v_today_purchase,
      'grossProfit', v_gross,
      'netProfit', v_net,
      'cashCollection', v_today_paid,
      'dueCollection', v_today_due,
      'totalCustomers', v_customers,
      'totalSuppliers', v_suppliers,
      'inventoryValue', v_inventory,
      'expiring30', v_expiring,
      'lowStock', v_low,
      'outOfStock', v_oos
    ),
    'trend7', v_trend7,
    'trend30', v_trend30,
    'topMedicines', v_top_meds,
    'topCategories', v_top_cats,
    'topCustomers', v_top_customers,
    'topCashiers', v_top_cashiers
  );
end;
$$;

grant execute on function public.branch_dashboard_metrics(uuid, uuid) to authenticated;

create or replace function public.corporate_dashboard_metrics(_tenant uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_total_sales numeric := 0;
  v_total_purchase numeric := 0;
  v_total_profit numeric := 0;
  v_total_inventory numeric := 0;
  v_total_due numeric := 0;
  v_total_collections numeric := 0;
  v_active_customers int := 0;
  v_active_suppliers int := 0;
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
  from purchases where tenant_id = _tenant and is_return=false
    and purchase_date >= v_today - 29;

  select coalesce(sum(si.line_total - si.unit_cost*si.qty),0) into v_total_profit
  from sale_items si join sales s on s.id=si.sale_id
  where si.tenant_id = _tenant and s.is_return=false and s.status::text='completed'
    and s.sale_date >= v_today - 29;

  select coalesce(sum(ps.qty_on_hand * coalesce(pb.purchase_price,0)),0)
  into v_total_inventory
  from product_stock ps left join product_batches pb on pb.id = ps.batch_id
  where ps.tenant_id = _tenant and ps.deleted_at is null;

  select count(*) into v_active_customers from customers where tenant_id = _tenant and is_active = true;
  select count(*) into v_active_suppliers from suppliers where tenant_id = _tenant;

  select coalesce(jsonb_agg(row_to_json(t) order by t.sales desc), '[]'::jsonb) into v_branch_compare from (
    select
      b.id as branch_id,
      b.name as branch_name,
      b.branch_role,
      coalesce((
        select sum(s.total) from sales s
        join warehouses w on w.id = s.warehouse_id
        where s.tenant_id = _tenant and w.branch_id = b.id
          and s.is_return=false and s.status::text='completed'
          and s.sale_date >= v_today - 29
      ),0)::numeric as sales,
      coalesce((
        select sum(si.line_total - si.unit_cost*si.qty)
        from sale_items si join sales s on s.id=si.sale_id
        join warehouses w on w.id = s.warehouse_id
        where si.tenant_id = _tenant and w.branch_id = b.id
          and s.is_return=false and s.status::text='completed'
          and s.sale_date >= v_today - 29
      ),0)::numeric as profit,
      coalesce((
        select sum(s.paid) from sales s
        join warehouses w on w.id = s.warehouse_id
        where s.tenant_id = _tenant and w.branch_id = b.id
          and s.is_return=false and s.status::text='completed'
          and s.sale_date >= v_today - 29
      ),0)::numeric as collections,
      coalesce((
        select sum(ps.qty_on_hand * coalesce(pb.purchase_price,0))
        from product_stock ps left join product_batches pb on pb.id=ps.batch_id
        where ps.tenant_id = _tenant and ps.branch_id = b.id and ps.deleted_at is null
      ),0)::numeric as inventory_value
    from branches b
    where b.tenant_id = _tenant and b.deleted_at is null and b.is_active = true
  ) t;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_low_monitor from (
    select p.name as product, b.name as branch, ps.qty_on_hand as qty, ps.reorder_level as reorder
    from product_stock ps
    join products p on p.id = ps.product_id
    join branches b on b.id = ps.branch_id
    where ps.tenant_id = _tenant and ps.deleted_at is null
      and ps.qty_on_hand <= ps.reorder_level
    order by (ps.reorder_level - ps.qty_on_hand) desc
    limit 50
  ) t;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_expiry_monitor from (
    select
      p.name as product, b.name as branch, pb.batch_no, pb.expiry_date, pb.qty_on_hand,
      case
        when pb.expiry_date < v_today then 'expired'
        when pb.expiry_date <= v_today + 7 then '7d'
        when pb.expiry_date <= v_today + 30 then '30d'
        else '90d'
      end as bucket
    from product_batches pb
    join products p on p.id = pb.product_id
    left join branches b on b.id = pb.branch_id
    where pb.tenant_id = _tenant and pb.deleted_at is null
      and pb.qty_on_hand > 0
      and pb.expiry_date is not null
      and pb.expiry_date <= v_today + 90
    order by pb.expiry_date asc
    limit 100
  ) t;

  return jsonb_build_object(
    'kpi', jsonb_build_object(
      'totalSales', v_total_sales,
      'totalPurchase', v_total_purchase,
      'totalProfit', v_total_profit,
      'totalInventory', v_total_inventory,
      'totalDue', v_total_due,
      'totalCollections', v_total_collections,
      'activeCustomers', v_active_customers,
      'activeSuppliers', v_active_suppliers
    ),
    'branches', v_branch_compare,
    'lowStock', v_low_monitor,
    'expiry', v_expiry_monitor
  );
end;
$$;

grant execute on function public.corporate_dashboard_metrics(uuid) to authenticated;
