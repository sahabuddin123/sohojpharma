-- S3.1 Number Series Integration: route DB-side numbering through generate_next_number

-- Sales / POS / Receipt: delegate next_invoice_no to centralized engine
CREATE OR REPLACE FUNCTION public.next_invoice_no(_tenant_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_no text;
BEGIN
  v_no := public.generate_next_number(_tenant_id, 'invoice');
  RETURN v_no;
END $function$;

-- Stock transfers: delegate to centralized engine
CREATE OR REPLACE FUNCTION public.stock_transfer_request(
  _tenant_id uuid,
  _from_warehouse_id uuid,
  _to_warehouse_id uuid,
  _items jsonb,
  _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_no text;
  v_from_branch uuid;
  v_to_branch uuid;
  v_item jsonb;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF _from_warehouse_id = _to_warehouse_id THEN
    RAISE EXCEPTION 'same_warehouse' USING ERRCODE='22023';
  END IF;

  SELECT branch_id INTO v_from_branch FROM public.warehouses WHERE id=_from_warehouse_id AND tenant_id=_tenant_id;
  SELECT branch_id INTO v_to_branch   FROM public.warehouses WHERE id=_to_warehouse_id   AND tenant_id=_tenant_id;

  v_no := public.generate_next_number(_tenant_id, 'transfer');

  INSERT INTO public.stock_transfers(
    tenant_id, transfer_no, from_branch_id, to_branch_id,
    from_warehouse_id, to_warehouse_id,
    status, requested_by, notes, requested_at
  ) VALUES (
    _tenant_id, v_no, v_from_branch, v_to_branch,
    _from_warehouse_id, _to_warehouse_id,
    'requested', auth.uid(), _notes, now()
  ) RETURNING id INTO v_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    INSERT INTO public.stock_transfer_items(
      tenant_id, transfer_id, product_id, batch_id,
      qty_requested, qty_sent, qty_received, unit_cost
    ) VALUES (
      _tenant_id, v_id,
      (v_item->>'product_id')::uuid,
      NULLIF(v_item->>'batch_id','')::uuid,
      (v_item->>'qty')::numeric, 0, 0,
      COALESCE((v_item->>'unit_cost')::numeric, 0)
    );
  END LOOP;

  PERFORM public.notify_tenant_v2(
    _tenant_id, 'info', 'transfer_requested',
    'Stock Transfer Requested',
    'Transfer ' || v_no || ' requested.',
    '/inventory/transfers/' || v_id::text,
    'stock_transfer', v_id, jsonb_build_object('transfer_no', v_no)
  );

  INSERT INTO public.audit_log(tenant_id, user_id, action, entity_table, entity_id, after_data)
  VALUES (_tenant_id, auth.uid(), 'warehouse.transfer.requested', 'stock_transfers', v_id,
          jsonb_build_object('transfer_no', v_no, 'from_warehouse_id', _from_warehouse_id, 'to_warehouse_id', _to_warehouse_id));

  RETURN v_id;
END $$;

-- Convenience wrapper used by client server fns
CREATE OR REPLACE FUNCTION public.next_doc_no(_tenant_id uuid, _doc_type text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.generate_next_number(_tenant_id, _doc_type);
$$;

REVOKE ALL ON FUNCTION public.next_doc_no(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_doc_no(uuid, text) TO authenticated, service_role;