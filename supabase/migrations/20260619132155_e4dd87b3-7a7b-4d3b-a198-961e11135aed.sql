
-- 1) Tenant procurement settings
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS procurement_settings jsonb NOT NULL DEFAULT '{"require_grn_approval":false,"require_transfer_approval":true,"require_po_approval":true}'::jsonb;

-- 2) GRN status
ALTER TABLE public.goods_receipts
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'received',
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

-- 3) Transfer approval RPCs
CREATE OR REPLACE FUNCTION public.batch_transfer_request(
  _tenant_id uuid, _batch_id uuid, _qty numeric,
  _from_branch uuid, _to_branch uuid, _notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_src public.batches%ROWTYPE; v_id uuid; v_no text;
BEGIN
  SELECT * INTO v_src FROM public.batches WHERE id=_batch_id AND tenant_id=_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF v_src.status IN ('recalled','locked') THEN RAISE EXCEPTION 'Cannot transfer % batch', v_src.status; END IF;
  IF _qty <= 0 OR _qty > v_src.qty_on_hand THEN RAISE EXCEPTION 'Invalid qty (avail %)', v_src.qty_on_hand; END IF;
  v_no := 'TRF-'||to_char(now(),'YYYYMMDDHH24MISS');
  INSERT INTO public.stock_transfers(tenant_id,transfer_no,from_branch_id,to_branch_id,status,requested_by,notes,requested_at)
  VALUES (_tenant_id,v_no,_from_branch,_to_branch,'requested',auth.uid(),_notes,now())
  RETURNING id INTO v_id;
  INSERT INTO public.stock_transfer_items(tenant_id,transfer_id,product_id,batch_id,qty_requested,unit_cost)
  VALUES (_tenant_id,v_id,v_src.product_id,v_src.id,_qty,v_src.purchase_price);
  INSERT INTO public.audit_log(tenant_id,user_id,action,entity_table,entity_id,after_data)
  VALUES (_tenant_id,auth.uid(),'transfer.requested','stock_transfers',v_id,
    jsonb_build_object('transfer_no',v_no,'qty',_qty,'batch',v_src.id));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.batch_transfer_approve(
  _tenant_id uuid, _transfer_id uuid, _approve boolean, _reject_reason text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.stock_transfers%ROWTYPE; itm public.stock_transfer_items%ROWTYPE;
        v_src public.batches%ROWTYPE; v_new_id uuid; v_after_src numeric; v_after_dst numeric;
BEGIN
  SELECT * INTO t FROM public.stock_transfers WHERE id=_transfer_id AND tenant_id=_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF t.status <> 'requested' THEN RAISE EXCEPTION 'Transfer is not pending (status=%)', t.status; END IF;

  IF NOT _approve THEN
    UPDATE public.stock_transfers
       SET status='rejected', approved_by=auth.uid(), approved_at=now(),
           notes=COALESCE(notes,'')||' | rejected: '||COALESCE(_reject_reason,'')
     WHERE id=t.id;
    INSERT INTO public.audit_log(tenant_id,user_id,action,entity_table,entity_id,after_data)
    VALUES (_tenant_id,auth.uid(),'transfer.rejected','stock_transfers',t.id,
      jsonb_build_object('reason',_reject_reason));
    RETURN t.id;
  END IF;

  SELECT * INTO itm FROM public.stock_transfer_items WHERE transfer_id=t.id LIMIT 1;
  SELECT * INTO v_src FROM public.batches WHERE id=itm.batch_id AND tenant_id=_tenant_id FOR UPDATE;
  IF v_src.qty_on_hand < itm.qty_requested THEN RAISE EXCEPTION 'Insufficient stock at approval time'; END IF;

  v_after_src := v_src.qty_on_hand - itm.qty_requested;
  UPDATE public.batches SET qty_on_hand=v_after_src, updated_at=now() WHERE id=v_src.id;

  SELECT id INTO v_new_id FROM public.batches
   WHERE tenant_id=_tenant_id AND product_id=v_src.product_id AND batch_no=v_src.batch_no
     AND expiry_date IS NOT DISTINCT FROM v_src.expiry_date AND purchase_price=v_src.purchase_price
     AND branch_id IS NOT DISTINCT FROM t.to_branch_id LIMIT 1;
  IF v_new_id IS NULL THEN
    INSERT INTO public.batches(tenant_id,product_id,batch_no,mfg_date,expiry_date,purchase_price,mrp,
      qty_on_hand,branch_id,supplier_id,status,source,created_by)
    VALUES (_tenant_id,v_src.product_id,v_src.batch_no,v_src.mfg_date,v_src.expiry_date,v_src.purchase_price,
      v_src.mrp,itm.qty_requested,t.to_branch_id,v_src.supplier_id,'active','transfer',auth.uid())
    RETURNING id INTO v_new_id;
    v_after_dst := itm.qty_requested;
  ELSE
    UPDATE public.batches SET qty_on_hand=qty_on_hand+itm.qty_requested, updated_at=now()
     WHERE id=v_new_id RETURNING qty_on_hand INTO v_after_dst;
  END IF;

  UPDATE public.stock_transfer_items SET qty_sent=qty_requested, qty_received=qty_requested WHERE id=itm.id;
  UPDATE public.stock_transfers
     SET status='received', approved_by=auth.uid(), approved_at=now(),
         shipped_at=now(), received_at=now(), received_by=auth.uid()
   WHERE id=t.id;

  INSERT INTO public.stock_movements(tenant_id,product_id,batch_id,movement_type,qty_change,qty_after,
    reference_table,reference_id,reference_no,user_id,notes)
  VALUES
    (_tenant_id,v_src.product_id,v_src.id,'transfer_out',-itm.qty_requested,v_after_src,'stock_transfers',t.id,t.transfer_no,auth.uid(),'approved transfer'),
    (_tenant_id,v_src.product_id,v_new_id,'transfer_in', itm.qty_requested,v_after_dst,'stock_transfers',t.id,t.transfer_no,auth.uid(),'approved transfer');

  INSERT INTO public.audit_log(tenant_id,user_id,action,entity_table,entity_id,after_data)
  VALUES (_tenant_id,auth.uid(),'transfer.approved','stock_transfers',t.id,
    jsonb_build_object('transfer_no',t.transfer_no,'qty',itm.qty_requested,'dest_batch',v_new_id));
  RETURN t.id;
END $$;

-- 4) PO approval RPCs
CREATE OR REPLACE FUNCTION public.po_submit(_tenant_id uuid, _po_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status text;
BEGIN
  SELECT status::text INTO v_status FROM public.purchase_orders WHERE id=_po_id AND tenant_id=_tenant_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'PO not found'; END IF;
  IF v_status NOT IN ('draft') THEN RAISE EXCEPTION 'PO cannot be submitted (status=%)', v_status; END IF;
  UPDATE public.purchase_orders SET status='submitted' WHERE id=_po_id;
  INSERT INTO public.audit_log(tenant_id,user_id,action,entity_table,entity_id,after_data)
  VALUES (_tenant_id,auth.uid(),'po.submitted','purchase_orders',_po_id,jsonb_build_object('from',v_status,'to','submitted'));
END $$;

CREATE OR REPLACE FUNCTION public.po_approve(_tenant_id uuid, _po_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status text;
BEGIN
  SELECT status::text INTO v_status FROM public.purchase_orders WHERE id=_po_id AND tenant_id=_tenant_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'PO not found'; END IF;
  IF v_status NOT IN ('submitted','draft') THEN RAISE EXCEPTION 'PO cannot be approved (status=%)', v_status; END IF;
  UPDATE public.purchase_orders SET status='approved', approved_by=auth.uid(), approved_at=now() WHERE id=_po_id;
  INSERT INTO public.audit_log(tenant_id,user_id,action,entity_table,entity_id,after_data)
  VALUES (_tenant_id,auth.uid(),'po.approved','purchase_orders',_po_id,jsonb_build_object('from',v_status,'to','approved'));
END $$;

CREATE OR REPLACE FUNCTION public.po_reject(_tenant_id uuid, _po_id uuid, _reason text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status text;
BEGIN
  SELECT status::text INTO v_status FROM public.purchase_orders WHERE id=_po_id AND tenant_id=_tenant_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'PO not found'; END IF;
  IF v_status NOT IN ('submitted','draft') THEN RAISE EXCEPTION 'PO cannot be rejected (status=%)', v_status; END IF;
  UPDATE public.purchase_orders SET status='cancelled', cancelled_at=now(),
    notes = COALESCE(notes,'')||' | rejected: '||COALESCE(_reason,'') WHERE id=_po_id;
  INSERT INTO public.audit_log(tenant_id,user_id,action,entity_table,entity_id,after_data)
  VALUES (_tenant_id,auth.uid(),'po.rejected','purchase_orders',_po_id,jsonb_build_object('from',v_status,'reason',_reason));
END $$;

-- 5) GRN approval
CREATE OR REPLACE FUNCTION public.grn_approve(_tenant_id uuid, _grn_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM public.goods_receipts WHERE id=_grn_id AND tenant_id=_tenant_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'GRN not found'; END IF;
  IF v_status NOT IN ('pending','received') THEN RAISE EXCEPTION 'GRN cannot be approved (status=%)', v_status; END IF;
  UPDATE public.goods_receipts SET status='approved', approved_by=auth.uid(), approved_at=now() WHERE id=_grn_id;
  INSERT INTO public.audit_log(tenant_id,user_id,action,entity_table,entity_id,after_data)
  VALUES (_tenant_id,auth.uid(),'grn.approved','goods_receipts',_grn_id,jsonb_build_object('from',v_status,'to','approved'));
END $$;

REVOKE EXECUTE ON FUNCTION public.batch_transfer_request(uuid,uuid,numeric,uuid,uuid,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.batch_transfer_approve(uuid,uuid,boolean,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.po_submit(uuid,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.po_approve(uuid,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.po_reject(uuid,uuid,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.grn_approve(uuid,uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.batch_transfer_request(uuid,uuid,numeric,uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.batch_transfer_approve(uuid,uuid,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.po_submit(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.po_approve(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.po_reject(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grn_approve(uuid,uuid) TO authenticated;
