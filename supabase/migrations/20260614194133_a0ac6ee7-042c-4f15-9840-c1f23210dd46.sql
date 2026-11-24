
DROP FUNCTION IF EXISTS public.test_tenant_isolation();

CREATE OR REPLACE FUNCTION public.test_tenant_isolation()
RETURNS TABLE(test_name text, passed boolean, detail text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t1 uuid; t2 uuid;
  uA uuid := gen_random_uuid();
  pA uuid; pB uuid;
  cA uuid; cB uuid;
  sA uuid; sB uuid;
  supA uuid; supB uuid;
  bA uuid; bB uuid;
  poA uuid; poB uuid;
  lA uuid; lB uuid;
  v_count int;
  v_err text;
BEGIN
  INSERT INTO public.tenants(name,slug) VALUES('iso-A-'||uA,'iso-a-'||substr(uA::text,1,8)) RETURNING id INTO t1;
  INSERT INTO public.tenants(name,slug) VALUES('iso-B-'||uA,'iso-b-'||substr(uA::text,1,8)) RETURNING id INTO t2;

  INSERT INTO public.products(tenant_id,name,sku) VALUES(t1,'p-A','SKU-A-'||substr(t1::text,1,6)) RETURNING id INTO pA;
  INSERT INTO public.products(tenant_id,name,sku) VALUES(t2,'p-B','SKU-B-'||substr(t2::text,1,6)) RETURNING id INTO pB;
  INSERT INTO public.customers(tenant_id,name) VALUES(t1,'cust-A') RETURNING id INTO cA;
  INSERT INTO public.customers(tenant_id,name) VALUES(t2,'cust-B') RETURNING id INTO cB;
  INSERT INTO public.suppliers(tenant_id,name) VALUES(t1,'sup-A')  RETURNING id INTO supA;
  INSERT INTO public.suppliers(tenant_id,name) VALUES(t2,'sup-B')  RETURNING id INTO supB;
  INSERT INTO public.batches(tenant_id,product_id,batch_no,expiry_date,purchase_price,qty_on_hand)
    VALUES(t1,pA,'BA',CURRENT_DATE+365,10,5) RETURNING id INTO bA;
  INSERT INTO public.batches(tenant_id,product_id,batch_no,expiry_date,purchase_price,qty_on_hand)
    VALUES(t2,pB,'BB',CURRENT_DATE+365,10,5) RETURNING id INTO bB;
  INSERT INTO public.sales(tenant_id,invoice_no,customer_id,subtotal,total,paid,due,payment_method,status)
    VALUES(t1,'INV-A-'||substr(t1::text,1,6),cA,0,0,0,0,'cash','completed') RETURNING id INTO sA;
  INSERT INTO public.sales(tenant_id,invoice_no,customer_id,subtotal,total,paid,due,payment_method,status)
    VALUES(t2,'INV-B-'||substr(t2::text,1,6),cB,0,0,0,0,'cash','completed') RETURNING id INTO sB;
  INSERT INTO public.purchase_orders(tenant_id,po_number,supplier_id,status)
    VALUES(t1,'PO-A-'||substr(t1::text,1,6),supA,'draft') RETURNING id INTO poA;
  INSERT INTO public.purchase_orders(tenant_id,po_number,supplier_id,status)
    VALUES(t2,'PO-B-'||substr(t2::text,1,6),supB,'draft') RETURNING id INTO poB;
  INSERT INTO public.party_ledger(tenant_id,party_type,party_id,entry_type,debit,credit)
    VALUES(t1,'customer',cA,'opening',100,0) RETURNING id INTO lA;
  INSERT INTO public.party_ledger(tenant_id,party_type,party_id,entry_type,debit,credit)
    VALUES(t2,'customer',cB,'opening',100,0) RETURNING id INTO lB;

  -- Assertion: reject NULL tenant_id (defense-in-depth RESTRICTIVE policy)
  BEGIN
    INSERT INTO public.products(tenant_id,name,sku)
      VALUES(NULL,'null-leak','NULL-'||substr(gen_random_uuid()::text,1,6));
    test_name:='reject_null_tenant_insert'; passed:=false; detail:='insert succeeded'; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    test_name:='reject_null_tenant_insert'; passed:=true;  detail:=SQLERRM; RETURN NEXT;
  END;

  -- Become user A, member of t1 only
  INSERT INTO public.tenant_members(tenant_id,user_id,is_default) VALUES(t1,uA,true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',uA::text,'role','authenticated')::text, true);
  PERFORM set_config('role','authenticated', true);

  -- CANNOT read Store B
  EXECUTE 'SELECT count(*) FROM public.products       WHERE id=$1' INTO v_count USING pB;
    test_name:='products.cross_tenant_read_blocked';   passed:=(v_count=0); detail:=format('visible=%s',v_count); RETURN NEXT;
  EXECUTE 'SELECT count(*) FROM public.customers      WHERE id=$1' INTO v_count USING cB;
    test_name:='customers.cross_tenant_read_blocked';  passed:=(v_count=0); detail:=format('visible=%s',v_count); RETURN NEXT;
  EXECUTE 'SELECT count(*) FROM public.suppliers      WHERE id=$1' INTO v_count USING supB;
    test_name:='suppliers.cross_tenant_read_blocked';  passed:=(v_count=0); detail:=format('visible=%s',v_count); RETURN NEXT;
  EXECUTE 'SELECT count(*) FROM public.sales          WHERE id=$1' INTO v_count USING sB;
    test_name:='sales.cross_tenant_read_blocked';      passed:=(v_count=0); detail:=format('visible=%s',v_count); RETURN NEXT;
  EXECUTE 'SELECT count(*) FROM public.purchase_orders WHERE id=$1' INTO v_count USING poB;
    test_name:='purchases.cross_tenant_read_blocked';  passed:=(v_count=0); detail:=format('visible=%s',v_count); RETURN NEXT;
  EXECUTE 'SELECT count(*) FROM public.batches        WHERE id=$1' INTO v_count USING bB;
    test_name:='batches.cross_tenant_read_blocked';    passed:=(v_count=0); detail:=format('visible=%s',v_count); RETURN NEXT;
  EXECUTE 'SELECT count(*) FROM public.party_ledger   WHERE id=$1' INTO v_count USING lB;
    test_name:='ledger.cross_tenant_read_blocked';     passed:=(v_count=0); detail:=format('visible=%s',v_count); RETURN NEXT;
  EXECUTE 'SELECT count(*) FROM public.v_sales_vat_register WHERE sale_id=$1' INTO v_count USING sB;
    test_name:='reports.sales_vat_blocked';            passed:=(v_count=0); detail:=format('visible=%s',v_count); RETURN NEXT;

  -- CAN read own
  EXECUTE 'SELECT count(*) FROM public.products  WHERE id=$1' INTO v_count USING pA;
    test_name:='products.own_read_works';   passed:=(v_count=1); detail:=format('visible=%s',v_count); RETURN NEXT;
  EXECUTE 'SELECT count(*) FROM public.customers WHERE id=$1' INTO v_count USING cA;
    test_name:='customers.own_read_works';  passed:=(v_count=1); detail:=format('visible=%s',v_count); RETURN NEXT;
  EXECUTE 'SELECT count(*) FROM public.sales     WHERE id=$1' INTO v_count USING sA;
    test_name:='sales.own_read_works';      passed:=(v_count=1); detail:=format('visible=%s',v_count); RETURN NEXT;
  EXECUTE 'SELECT count(*) FROM public.purchase_orders WHERE id=$1' INTO v_count USING poA;
    test_name:='purchases.own_read_works';  passed:=(v_count=1); detail:=format('visible=%s',v_count); RETURN NEXT;

  -- Cannot INSERT into Store B
  BEGIN
    EXECUTE format('INSERT INTO public.products(tenant_id,name,sku) VALUES(%L,%L,%L)',
                   t2,'leak','LK-'||substr(gen_random_uuid()::text,1,6));
    test_name:='products.cross_tenant_insert_blocked'; passed:=false; detail:='insert succeeded'; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    test_name:='products.cross_tenant_insert_blocked'; passed:=true;  detail:=SQLERRM; RETURN NEXT;
  END;

  -- Cannot UPDATE Store B
  EXECUTE format('UPDATE public.customers SET name=%L WHERE id=%L','pwned',cB);
  PERFORM set_config('role','postgres', true);
  EXECUTE 'SELECT count(*) FROM public.customers WHERE id=$1 AND name=$2' INTO v_count USING cB,'pwned';
  test_name:='customers.cross_tenant_update_blocked'; passed:=(v_count=0);
    detail:=format('updated rows=%s',v_count); RETURN NEXT;

  -- Cannot DELETE Store B
  PERFORM set_config('role','authenticated', true);
  EXECUTE format('DELETE FROM public.sales WHERE id=%L', sB);
  PERFORM set_config('role','postgres', true);
  EXECUTE 'SELECT count(*) FROM public.sales WHERE id=$1' INTO v_count USING sB;
  test_name:='sales.cross_tenant_delete_blocked'; passed:=(v_count=1);
    detail:=format('row still exists=%s', v_count>0); RETURN NEXT;

  PERFORM set_config('role','postgres', true);
  PERFORM set_config('request.jwt.claims','', true);
  DELETE FROM public.party_ledger    WHERE tenant_id IN (t1,t2);
  DELETE FROM public.purchase_orders WHERE tenant_id IN (t1,t2);
  DELETE FROM public.sales           WHERE tenant_id IN (t1,t2);
  DELETE FROM public.batches         WHERE tenant_id IN (t1,t2);
  DELETE FROM public.products        WHERE tenant_id IN (t1,t2);
  DELETE FROM public.customers       WHERE tenant_id IN (t1,t2);
  DELETE FROM public.suppliers       WHERE tenant_id IN (t1,t2);
  DELETE FROM public.tenant_members  WHERE tenant_id IN (t1,t2);
  DELETE FROM public.tenants         WHERE id IN (t1,t2);
  RETURN;
EXCEPTION WHEN OTHERS THEN
  v_err := SQLERRM;
  PERFORM set_config('role','postgres', true);
  PERFORM set_config('request.jwt.claims','', true);
  BEGIN DELETE FROM public.party_ledger    WHERE tenant_id IN (t1,t2); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.purchase_orders WHERE tenant_id IN (t1,t2); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.sales           WHERE tenant_id IN (t1,t2); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.batches         WHERE tenant_id IN (t1,t2); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.products        WHERE tenant_id IN (t1,t2); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.customers       WHERE tenant_id IN (t1,t2); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.suppliers       WHERE tenant_id IN (t1,t2); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.tenant_members  WHERE tenant_id IN (t1,t2); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.tenants         WHERE id IN (t1,t2); EXCEPTION WHEN OTHERS THEN NULL; END;
  test_name:='harness_error'; passed:=false; detail:=v_err; RETURN NEXT;
END $$;

REVOKE ALL ON FUNCTION public.test_tenant_isolation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.test_tenant_isolation() TO service_role;
