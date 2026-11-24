
CREATE OR REPLACE FUNCTION public.po_submit(_tenant_id uuid, _po_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status text;
BEGIN
  SELECT status::text INTO v_status FROM public.purchase_orders WHERE id=_po_id AND tenant_id=_tenant_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'PO not found'; END IF;
  IF v_status <> 'draft' THEN RAISE EXCEPTION 'PO cannot be submitted (status=%)', v_status; END IF;
  UPDATE public.purchase_orders SET status='sent' WHERE id=_po_id;
  INSERT INTO public.audit_log(tenant_id,user_id,action,entity_table,entity_id,after_data)
  VALUES (_tenant_id,auth.uid(),'po.submitted','purchase_orders',_po_id,jsonb_build_object('from',v_status,'to','sent'));
END $$;

CREATE OR REPLACE FUNCTION public.po_approve(_tenant_id uuid, _po_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status text;
BEGIN
  SELECT status::text INTO v_status FROM public.purchase_orders WHERE id=_po_id AND tenant_id=_tenant_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'PO not found'; END IF;
  IF v_status NOT IN ('sent','draft') THEN RAISE EXCEPTION 'PO cannot be approved (status=%)', v_status; END IF;
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
  IF v_status NOT IN ('sent','draft') THEN RAISE EXCEPTION 'PO cannot be rejected (status=%)', v_status; END IF;
  UPDATE public.purchase_orders SET status='cancelled', cancelled_at=now(),
    notes = COALESCE(notes,'')||' | rejected: '||COALESCE(_reason,'') WHERE id=_po_id;
  INSERT INTO public.audit_log(tenant_id,user_id,action,entity_table,entity_id,after_data)
  VALUES (_tenant_id,auth.uid(),'po.rejected','purchase_orders',_po_id,jsonb_build_object('from',v_status,'reason',_reason));
END $$;
