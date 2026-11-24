
-- =========================================================================
-- PART 4 — HELPER FUNCTIONS
-- =========================================================================

create or replace function public.is_corporate_role(_user uuid, _tenant uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(_user, _tenant, 'owner'::app_role)
      or public.has_role(_user, _tenant, 'corporate_admin'::app_role)
      or public.has_role(_user, _tenant, 'auditor'::app_role)
$$;

create or replace function public.is_corporate_writer(_user uuid, _tenant uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(_user, _tenant, 'owner'::app_role)
      or public.has_role(_user, _tenant, 'corporate_admin'::app_role)
$$;

create or replace function public.resolve_default_branch(_tenant uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.branches
   where tenant_id = _tenant and deleted_at is null
   order by (branch_role = 'head_office') desc, is_main desc, created_at asc
   limit 1
$$;

grant execute on function public.is_corporate_role(uuid, uuid)   to authenticated;
grant execute on function public.is_corporate_writer(uuid, uuid) to authenticated;
grant execute on function public.resolve_default_branch(uuid)    to authenticated;

-- =========================================================================
-- PART 1 — ADD nullable branch_id (and warehouse_id on purchases)
-- =========================================================================
alter table public.purchases add column if not exists warehouse_id uuid references public.warehouses(id);

do $$
declare t text;
declare tables text[] := array[
  'purchases','purchase_items','purchase_returns','purchase_return_items',
  'purchase_orders','purchase_order_items','goods_receipts','goods_receipt_items',
  'sales','sale_items','sale_payments','sales_returns','sale_return_items',
  'stock_transfer_items',
  'customer_payments','supplier_payments','expenses','incomes',
  'quotations','quotation_items',
  'prescriptions','prescription_items','clinical_audit',
  'journal_lines','party_ledger','cash_register_transactions'
];
begin
  foreach t in array tables loop
    execute format('alter table public.%I add column if not exists branch_id uuid references public.branches(id)', t);
  end loop;
end$$;

-- =========================================================================
-- PART 8 — INDEXES
-- =========================================================================
do $$
declare t text;
declare tables text[] := array[
  'purchases','purchase_items','purchase_returns','purchase_return_items',
  'purchase_orders','purchase_order_items','goods_receipts','goods_receipt_items',
  'sales','sale_items','sale_payments','sales_returns','sale_return_items',
  'stock_transfer_items',
  'customer_payments','supplier_payments','expenses','incomes',
  'quotations','quotation_items',
  'prescriptions','prescription_items','clinical_audit',
  'journal_lines','party_ledger','cash_register_transactions'
];
begin
  foreach t in array tables loop
    execute format('create index if not exists %I on public.%I (tenant_id, branch_id)',
                   'idx_'||t||'_tenant_branch', t);
    execute format('create index if not exists %I on public.%I (branch_id)',
                   'idx_'||t||'_branch', t);
  end loop;
end$$;

create index if not exists idx_stock_transfers_status_from_branch
  on public.stock_transfers (status, from_branch_id);
create index if not exists idx_stock_transfers_status_to_branch
  on public.stock_transfers (status, to_branch_id);

-- =========================================================================
-- PART 2 — DATA BACKFILL
-- =========================================================================
update public.sales s set branch_id = w.branch_id
  from public.warehouses w
 where s.warehouse_id = w.id and s.branch_id is null and w.branch_id is not null;

update public.sale_items si set branch_id = s.branch_id
  from public.sales s
 where si.sale_id = s.id and si.branch_id is null and s.branch_id is not null;

update public.sale_payments sp set branch_id = s.branch_id
  from public.sales s
 where sp.sale_id = s.id and sp.branch_id is null and s.branch_id is not null;

update public.sales_returns sr set branch_id = s.branch_id
  from public.sales s
 where sr.sale_id = s.id and sr.branch_id is null and s.branch_id is not null;

update public.sale_return_items sri set branch_id = sr.branch_id
  from public.sales_returns sr
 where sri.return_id = sr.id and sri.branch_id is null and sr.branch_id is not null;

update public.purchases p set branch_id = w.branch_id
  from public.warehouses w
 where p.warehouse_id = w.id and p.branch_id is null and w.branch_id is not null;

update public.purchase_items pi set branch_id = p.branch_id
  from public.purchases p
 where pi.purchase_id = p.id and pi.branch_id is null and p.branch_id is not null;

update public.purchase_returns pr set branch_id = gr.branch_id
  from public.goods_receipts gr
 where pr.grn_id = gr.id and pr.branch_id is null and gr.branch_id is not null;

update public.purchase_return_items pri set branch_id = pr.branch_id
  from public.purchase_returns pr
 where pri.return_id = pr.id and pri.branch_id is null and pr.branch_id is not null;

update public.purchase_order_items poi set branch_id = po.branch_id
  from public.purchase_orders po
 where poi.purchase_order_id = po.id and poi.branch_id is null and po.branch_id is not null;

update public.goods_receipts gr set branch_id = po.branch_id
  from public.purchase_orders po
 where gr.po_id = po.id and gr.branch_id is null and po.branch_id is not null;

update public.goods_receipt_items gri set branch_id = gr.branch_id
  from public.goods_receipts gr
 where gri.grn_id = gr.id and gri.branch_id is null and gr.branch_id is not null;

update public.stock_transfer_items sti set branch_id = st.from_branch_id
  from public.stock_transfers st
 where sti.transfer_id = st.id and sti.branch_id is null and st.from_branch_id is not null;

update public.customer_payments cp set branch_id = s.branch_id
  from public.sales s
 where cp.sale_id = s.id and cp.branch_id is null and s.branch_id is not null;

update public.supplier_payments sp set branch_id = p.branch_id
  from public.purchases p
 where sp.purchase_id = p.id and sp.branch_id is null and p.branch_id is not null;

update public.cash_register_transactions crt set branch_id = cr.branch_id
  from public.cash_registers cr
 where crt.register_id = cr.id and crt.branch_id is null and cr.branch_id is not null;

update public.clinical_audit ca set branch_id = s.branch_id
  from public.sales s
 where ca.sale_id = s.id and ca.branch_id is null and s.branch_id is not null;

update public.prescription_items pri set branch_id = pr.branch_id
  from public.prescriptions pr
 where pri.prescription_id = pr.id and pri.branch_id is null and pr.branch_id is not null;

update public.quotation_items qi set branch_id = q.branch_id
  from public.quotations q
 where qi.quotation_id = q.id and qi.branch_id is null and q.branch_id is not null;

-- journal_lines: bypass the "posted journals immutable" trigger for the one-shot backfill
alter table public.journal_lines disable trigger user;
update public.journal_lines jl set branch_id = je.branch_id
  from public.journal_entries je
 where jl.journal_id = je.id and jl.branch_id is null and je.branch_id is not null;
alter table public.journal_lines enable trigger user;

-- HQ fallback for everything still null
do $$
declare t text;
declare tables text[] := array[
  'purchases','purchase_items','purchase_returns','purchase_return_items',
  'purchase_orders','purchase_order_items','goods_receipts','goods_receipt_items',
  'sales','sale_items','sale_payments','sales_returns','sale_return_items',
  'stock_transfer_items',
  'customer_payments','supplier_payments','expenses','incomes',
  'quotations','quotation_items',
  'prescriptions','prescription_items','clinical_audit',
  'party_ledger','cash_register_transactions'
];
begin
  foreach t in array tables loop
    execute format(
      'update public.%I x set branch_id = public.resolve_default_branch(x.tenant_id) where x.branch_id is null and x.tenant_id is not null',
      t);
  end loop;
end$$;

-- journal_lines HQ fallback with same trigger bypass
alter table public.journal_lines disable trigger user;
update public.journal_lines x set branch_id = public.resolve_default_branch(x.tenant_id)
 where x.branch_id is null and x.tenant_id is not null;
alter table public.journal_lines enable trigger user;

-- =========================================================================
-- PART 3 — AUTO-DERIVE BEFORE INSERT TRIGGERS
-- =========================================================================
create or replace function public.tg_branch_from_warehouse()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.branch_id is null and new.warehouse_id is not null then
    select w.branch_id into new.branch_id from public.warehouses w where w.id = new.warehouse_id;
  end if;
  if new.branch_id is null and new.tenant_id is not null then
    new.branch_id := public.resolve_default_branch(new.tenant_id);
  end if;
  return new;
end$$;

create or replace function public.tg_branch_default_hq()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.branch_id is null and new.tenant_id is not null then
    new.branch_id := public.resolve_default_branch(new.tenant_id);
  end if;
  return new;
end$$;

create or replace function public.tg_branch_from_sale()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.branch_id is null and new.sale_id is not null then
    select s.branch_id into new.branch_id from public.sales s where s.id = new.sale_id;
  end if;
  if new.branch_id is null and new.tenant_id is not null then
    new.branch_id := public.resolve_default_branch(new.tenant_id);
  end if;
  return new;
end$$;

create or replace function public.tg_branch_from_purchase()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.branch_id is null and new.purchase_id is not null then
    select p.branch_id into new.branch_id from public.purchases p where p.id = new.purchase_id;
  end if;
  if new.branch_id is null and new.tenant_id is not null then
    new.branch_id := public.resolve_default_branch(new.tenant_id);
  end if;
  return new;
end$$;

create or replace function public.tg_branch_from_po()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.branch_id is null and new.purchase_order_id is not null then
    select po.branch_id into new.branch_id from public.purchase_orders po where po.id = new.purchase_order_id;
  end if;
  if new.branch_id is null and new.tenant_id is not null then
    new.branch_id := public.resolve_default_branch(new.tenant_id);
  end if;
  return new;
end$$;

create or replace function public.tg_branch_from_grn()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.branch_id is null and new.grn_id is not null then
    select g.branch_id into new.branch_id from public.goods_receipts g where g.id = new.grn_id;
  end if;
  if new.branch_id is null and new.tenant_id is not null then
    new.branch_id := public.resolve_default_branch(new.tenant_id);
  end if;
  return new;
end$$;

create or replace function public.tg_branch_grn_header()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.branch_id is null and new.po_id is not null then
    select po.branch_id into new.branch_id from public.purchase_orders po where po.id = new.po_id;
  end if;
  if new.branch_id is null and new.tenant_id is not null then
    new.branch_id := public.resolve_default_branch(new.tenant_id);
  end if;
  return new;
end$$;

create or replace function public.tg_branch_from_return()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.branch_id is null and new.return_id is not null and tg_table_name = 'sale_return_items' then
    select sr.branch_id into new.branch_id from public.sales_returns sr where sr.id = new.return_id;
  elsif new.branch_id is null and new.return_id is not null and tg_table_name = 'purchase_return_items' then
    select pr.branch_id into new.branch_id from public.purchase_returns pr where pr.id = new.return_id;
  end if;
  if new.branch_id is null and new.tenant_id is not null then
    new.branch_id := public.resolve_default_branch(new.tenant_id);
  end if;
  return new;
end$$;

create or replace function public.tg_branch_purchase_return_header()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.branch_id is null and new.grn_id is not null then
    select g.branch_id into new.branch_id from public.goods_receipts g where g.id = new.grn_id;
  end if;
  if new.branch_id is null and new.tenant_id is not null then
    new.branch_id := public.resolve_default_branch(new.tenant_id);
  end if;
  return new;
end$$;

create or replace function public.tg_branch_sales_return_header()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.branch_id is null and new.sale_id is not null then
    select s.branch_id into new.branch_id from public.sales s where s.id = new.sale_id;
  end if;
  if new.branch_id is null and new.tenant_id is not null then
    new.branch_id := public.resolve_default_branch(new.tenant_id);
  end if;
  return new;
end$$;

create or replace function public.tg_branch_from_quotation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.branch_id is null and new.quotation_id is not null then
    select q.branch_id into new.branch_id from public.quotations q where q.id = new.quotation_id;
  end if;
  if new.branch_id is null and new.tenant_id is not null then
    new.branch_id := public.resolve_default_branch(new.tenant_id);
  end if;
  return new;
end$$;

create or replace function public.tg_branch_from_prescription()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.branch_id is null and new.prescription_id is not null then
    select pr.branch_id into new.branch_id from public.prescriptions pr where pr.id = new.prescription_id;
  end if;
  if new.branch_id is null and new.tenant_id is not null then
    new.branch_id := public.resolve_default_branch(new.tenant_id);
  end if;
  return new;
end$$;

create or replace function public.tg_branch_from_clinical()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.branch_id is null and new.sale_id is not null then
    select s.branch_id into new.branch_id from public.sales s where s.id = new.sale_id;
  end if;
  if new.branch_id is null and new.tenant_id is not null then
    new.branch_id := public.resolve_default_branch(new.tenant_id);
  end if;
  return new;
end$$;

create or replace function public.tg_branch_from_transfer()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.branch_id is null and new.transfer_id is not null then
    select st.from_branch_id into new.branch_id from public.stock_transfers st where st.id = new.transfer_id;
  end if;
  if new.branch_id is null and new.tenant_id is not null then
    new.branch_id := public.resolve_default_branch(new.tenant_id);
  end if;
  return new;
end$$;

create or replace function public.tg_branch_from_register()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.branch_id is null and new.register_id is not null then
    select cr.branch_id into new.branch_id from public.cash_registers cr where cr.id = new.register_id;
  end if;
  if new.branch_id is null and new.tenant_id is not null then
    new.branch_id := public.resolve_default_branch(new.tenant_id);
  end if;
  return new;
end$$;

create or replace function public.tg_branch_from_journal_entry()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.branch_id is null and new.journal_id is not null then
    select je.branch_id into new.branch_id from public.journal_entries je where je.id = new.journal_id;
  end if;
  if new.branch_id is null and new.tenant_id is not null then
    new.branch_id := public.resolve_default_branch(new.tenant_id);
  end if;
  return new;
end$$;

do $$
declare spec record;
begin
  for spec in
    select * from (values
      ('sales',                       'tg_branch_from_warehouse'),
      ('purchases',                   'tg_branch_from_warehouse'),
      ('sale_items',                  'tg_branch_from_sale'),
      ('sale_payments',               'tg_branch_from_sale'),
      ('sales_returns',               'tg_branch_sales_return_header'),
      ('sale_return_items',           'tg_branch_from_return'),
      ('purchase_items',              'tg_branch_from_purchase'),
      ('purchase_orders',             'tg_branch_default_hq'),
      ('purchase_order_items',        'tg_branch_from_po'),
      ('goods_receipts',              'tg_branch_grn_header'),
      ('goods_receipt_items',         'tg_branch_from_grn'),
      ('purchase_returns',            'tg_branch_purchase_return_header'),
      ('purchase_return_items',       'tg_branch_from_return'),
      ('stock_transfer_items',        'tg_branch_from_transfer'),
      ('customer_payments',           'tg_branch_from_sale'),
      ('supplier_payments',           'tg_branch_from_purchase'),
      ('expenses',                    'tg_branch_default_hq'),
      ('incomes',                     'tg_branch_default_hq'),
      ('quotations',                  'tg_branch_default_hq'),
      ('quotation_items',             'tg_branch_from_quotation'),
      ('prescriptions',               'tg_branch_default_hq'),
      ('prescription_items',          'tg_branch_from_prescription'),
      ('clinical_audit',              'tg_branch_from_clinical'),
      ('journal_lines',               'tg_branch_from_journal_entry'),
      ('party_ledger',                'tg_branch_default_hq'),
      ('cash_register_transactions',  'tg_branch_from_register')
    ) as v(table_name, fn_name)
  loop
    execute format('drop trigger if exists tg_set_branch_id on public.%I', spec.table_name);
    execute format(
      'create trigger tg_set_branch_id before insert on public.%I for each row execute function public.%I()',
      spec.table_name, spec.fn_name);
  end loop;
end$$;

-- =========================================================================
-- PART 5 — PURCHASE ↔ WAREHOUSE CONSISTENCY
-- =========================================================================
create or replace function public.tg_purchase_branch_consistency()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_wh_branch uuid;
begin
  if new.warehouse_id is not null and new.branch_id is not null then
    select branch_id into v_wh_branch from public.warehouses where id = new.warehouse_id;
    if v_wh_branch is not null and v_wh_branch <> new.branch_id then
      raise exception
        using errcode = 'P0001',
              message = 'purchase_branch_mismatch',
              detail  = json_build_object(
                'error', 'purchase_branch_mismatch',
                'purchase_branch_id', new.branch_id,
                'warehouse_id', new.warehouse_id,
                'warehouse_branch_id', v_wh_branch
              )::text;
    end if;
  end if;
  return new;
end$$;

drop trigger if exists tg_purchase_branch_consistency on public.purchases;
create trigger tg_purchase_branch_consistency
  before insert or update of branch_id, warehouse_id on public.purchases
  for each row execute function public.tg_purchase_branch_consistency();

-- =========================================================================
-- PART 7 — ADDITIVE RESTRICTIVE RLS
-- =========================================================================
do $$
declare t text;
declare tables text[] := array[
  'purchases','purchase_items','purchase_returns','purchase_return_items',
  'purchase_orders','purchase_order_items','goods_receipts','goods_receipt_items',
  'sales','sale_items','sale_payments','sales_returns','sale_return_items',
  'stock_transfer_items',
  'customer_payments','supplier_payments','expenses','incomes',
  'quotations','quotation_items',
  'prescriptions','prescription_items','clinical_audit',
  'journal_lines','party_ledger','cash_register_transactions'
];
begin
  foreach t in array tables loop
    execute format('drop policy if exists "branch_isolation_select" on public.%I', t);
    execute format($p$
      create policy "branch_isolation_select" on public.%I
        as restrictive for select to authenticated
        using (
          branch_id is null
          or public.is_corporate_role(auth.uid(), tenant_id)
          or public.has_branch_access(auth.uid(), branch_id)
        )
    $p$, t);

    execute format('drop policy if exists "branch_isolation_insert" on public.%I', t);
    execute format($p$
      create policy "branch_isolation_insert" on public.%I
        as restrictive for insert to authenticated
        with check (
          branch_id is null
          or public.is_corporate_writer(auth.uid(), tenant_id)
          or public.has_branch_access(auth.uid(), branch_id)
        )
    $p$, t);

    execute format('drop policy if exists "branch_isolation_update" on public.%I', t);
    execute format($p$
      create policy "branch_isolation_update" on public.%I
        as restrictive for update to authenticated
        using (
          branch_id is null
          or public.is_corporate_writer(auth.uid(), tenant_id)
          or public.has_branch_access(auth.uid(), branch_id)
        )
        with check (
          branch_id is null
          or public.is_corporate_writer(auth.uid(), tenant_id)
          or public.has_branch_access(auth.uid(), branch_id)
        )
    $p$, t);

    execute format('drop policy if exists "branch_isolation_delete" on public.%I', t);
    execute format($p$
      create policy "branch_isolation_delete" on public.%I
        as restrictive for delete to authenticated
        using (
          branch_id is null
          or public.is_corporate_writer(auth.uid(), tenant_id)
          or public.has_branch_access(auth.uid(), branch_id)
        )
    $p$, t);
  end loop;
end$$;

drop policy if exists "branch_isolation_select" on public.stock_transfers;
create policy "branch_isolation_select" on public.stock_transfers
  as restrictive for select to authenticated
  using (
    public.is_corporate_role(auth.uid(), tenant_id)
    or public.has_branch_access(auth.uid(), from_branch_id)
    or public.has_branch_access(auth.uid(), to_branch_id)
  );

drop policy if exists "branch_isolation_insert" on public.stock_transfers;
create policy "branch_isolation_insert" on public.stock_transfers
  as restrictive for insert to authenticated
  with check (
    public.is_corporate_writer(auth.uid(), tenant_id)
    or public.has_branch_access(auth.uid(), from_branch_id)
  );

drop policy if exists "branch_isolation_update" on public.stock_transfers;
create policy "branch_isolation_update" on public.stock_transfers
  as restrictive for update to authenticated
  using (
    public.is_corporate_writer(auth.uid(), tenant_id)
    or public.has_branch_access(auth.uid(), from_branch_id)
    or public.has_branch_access(auth.uid(), to_branch_id)
  )
  with check (
    public.is_corporate_writer(auth.uid(), tenant_id)
    or public.has_branch_access(auth.uid(), from_branch_id)
    or public.has_branch_access(auth.uid(), to_branch_id)
  );

drop policy if exists "branch_isolation_delete" on public.stock_transfers;
create policy "branch_isolation_delete" on public.stock_transfers
  as restrictive for delete to authenticated
  using (
    public.is_corporate_writer(auth.uid(), tenant_id)
    or public.has_branch_access(auth.uid(), from_branch_id)
  );
