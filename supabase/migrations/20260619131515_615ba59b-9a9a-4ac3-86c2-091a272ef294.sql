
CREATE TABLE IF NOT EXISTS public.batch_recalls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  batch_id uuid NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  product_id uuid,
  supplier_id uuid,
  recall_reason text NOT NULL,
  recall_source text NOT NULL CHECK (recall_source IN ('manufacturer','supplier','regulator','internal','other')),
  recall_date date NOT NULL DEFAULT CURRENT_DATE,
  qty_locked numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','cancelled')),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.batch_recalls TO authenticated;
GRANT ALL ON public.batch_recalls TO service_role;
ALTER TABLE public.batch_recalls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant rw batch_recalls" ON public.batch_recalls FOR ALL TO authenticated
USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()))
WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_batch_recalls_tenant_batch ON public.batch_recalls(tenant_id, batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_recalls_supplier ON public.batch_recalls(tenant_id, supplier_id);

DROP TRIGGER IF EXISTS trg_batch_recalls_updated ON public.batch_recalls;
CREATE TRIGGER trg_batch_recalls_updated BEFORE UPDATE ON public.batch_recalls
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.tg_block_expired_batch_sale()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE v_expiry date; v_batchno text; v_pname text; v_status text;
BEGIN
  IF NEW.batch_id IS NULL OR NEW.qty IS NULL OR NEW.qty <= 0 THEN RETURN NEW; END IF;
  SELECT b.expiry_date, b.batch_no, b.status, p.name INTO v_expiry, v_batchno, v_status, v_pname
    FROM public.batches b LEFT JOIN public.products p ON p.id = b.product_id WHERE b.id = NEW.batch_id;
  IF v_expiry IS NOT NULL AND v_expiry < CURRENT_DATE THEN
    RAISE EXCEPTION 'Cannot sell expired medicine. Product: %, Batch: %, Expiry: %',
      COALESCE(v_pname,'?'), COALESCE(v_batchno,'?'), v_expiry USING ERRCODE = '22023';
  END IF;
  IF v_status IN ('recalled','locked') THEN
    RAISE EXCEPTION 'Cannot sell % batch. Product: %, Batch: %', v_status, COALESCE(v_pname,'?'), COALESCE(v_batchno,'?') USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.batch_transfer(
  _tenant_id uuid, _batch_id uuid, _qty numeric, _from_branch uuid, _to_branch uuid, _notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_src public.batches%ROWTYPE; v_new_id uuid; v_transfer_id uuid; v_no text; v_after_src numeric; v_after_dst numeric;
BEGIN
  SELECT * INTO v_src FROM public.batches WHERE id=_batch_id AND tenant_id=_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source batch not found'; END IF;
  IF v_src.status IN ('recalled','locked') THEN RAISE EXCEPTION 'Cannot transfer % batch', v_src.status; END IF;
  IF _qty <= 0 OR _qty > v_src.qty_on_hand THEN RAISE EXCEPTION 'Invalid qty (avail %)', v_src.qty_on_hand; END IF;
  v_after_src := v_src.qty_on_hand - _qty;
  UPDATE public.batches SET qty_on_hand=v_after_src, updated_at=now() WHERE id=v_src.id;
  SELECT id INTO v_new_id FROM public.batches
   WHERE tenant_id=_tenant_id AND product_id=v_src.product_id AND batch_no=v_src.batch_no
     AND expiry_date IS NOT DISTINCT FROM v_src.expiry_date AND purchase_price=v_src.purchase_price
     AND branch_id IS NOT DISTINCT FROM _to_branch LIMIT 1;
  IF v_new_id IS NULL THEN
    INSERT INTO public.batches(tenant_id,product_id,batch_no,mfg_date,expiry_date,purchase_price,mrp,
      qty_on_hand,branch_id,supplier_id,status,source,created_by)
    VALUES (_tenant_id,v_src.product_id,v_src.batch_no,v_src.mfg_date,v_src.expiry_date,v_src.purchase_price,
      v_src.mrp,_qty,_to_branch,v_src.supplier_id,'active','transfer',auth.uid())
    RETURNING id INTO v_new_id;
    v_after_dst := _qty;
  ELSE
    UPDATE public.batches SET qty_on_hand=qty_on_hand+_qty, updated_at=now() WHERE id=v_new_id RETURNING qty_on_hand INTO v_after_dst;
  END IF;
  v_no := 'TRF-'||to_char(now(),'YYYYMMDDHH24MISS');
  INSERT INTO public.stock_transfers(tenant_id,transfer_no,from_branch_id,to_branch_id,status,requested_by,
    approved_by,received_by,notes,requested_at,approved_at,shipped_at,received_at)
  VALUES (_tenant_id,v_no,_from_branch,_to_branch,'received',auth.uid(),auth.uid(),auth.uid(),_notes,now(),now(),now(),now())
  RETURNING id INTO v_transfer_id;
  INSERT INTO public.stock_transfer_items(tenant_id,transfer_id,product_id,batch_id,qty_requested,qty_sent,qty_received,unit_cost)
  VALUES (_tenant_id,v_transfer_id,v_src.product_id,v_src.id,_qty,_qty,_qty,v_src.purchase_price);
  INSERT INTO public.stock_movements(tenant_id,product_id,batch_id,movement_type,qty_change,qty_after,
    reference_table,reference_id,reference_no,user_id,notes)
  VALUES
    (_tenant_id,v_src.product_id,v_src.id,'transfer_out',-_qty,v_after_src,'stock_transfers',v_transfer_id,v_no,auth.uid(),_notes),
    (_tenant_id,v_src.product_id,v_new_id,'transfer_in', _qty,v_after_dst,'stock_transfers',v_transfer_id,v_no,auth.uid(),_notes);
  INSERT INTO public.audit_log(tenant_id,user_id,action,entity_table,entity_id,after_data)
  VALUES (_tenant_id,auth.uid(),'batch.transfer','batches',v_src.id,
    jsonb_build_object('transfer_no',v_no,'qty',_qty,'from_branch',_from_branch,'to_branch',_to_branch,'dest_batch',v_new_id));
  RETURN v_transfer_id;
END $$;

CREATE OR REPLACE FUNCTION public.batch_adjust(
  _tenant_id uuid, _batch_id uuid, _delta numeric, _reason text, _notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_b public.batches%ROWTYPE; v_new numeric; v_id uuid; v_no text;
BEGIN
  IF _reason NOT IN ('damage','shrinkage','found','manual') THEN RAISE EXCEPTION 'Invalid reason'; END IF;
  SELECT * INTO v_b FROM public.batches WHERE id=_batch_id AND tenant_id=_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Batch not found'; END IF;
  v_new := v_b.qty_on_hand + _delta;
  IF v_new < 0 THEN RAISE EXCEPTION 'Adjustment would result in negative stock'; END IF;
  UPDATE public.batches SET qty_on_hand=v_new, updated_at=now() WHERE id=v_b.id;
  v_no := 'ADJ-'||to_char(now(),'YYYYMMDDHH24MISS');
  INSERT INTO public.stock_movements(tenant_id,product_id,batch_id,movement_type,qty_change,qty_after,reference_table,reference_no,user_id,notes)
  VALUES (_tenant_id,v_b.product_id,v_b.id,'adjustment',_delta,v_new,'batch_adjust',v_no,auth.uid(),_reason||COALESCE(' — '||_notes,''))
  RETURNING id INTO v_id;
  INSERT INTO public.audit_log(tenant_id,user_id,action,entity_table,entity_id,after_data)
  VALUES (_tenant_id,auth.uid(),'batch.adjust','batches',v_b.id,jsonb_build_object('ref',v_no,'delta',_delta,'reason',_reason,'qty_after',v_new));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.batch_merge(
  _tenant_id uuid, _src_batch_id uuid, _dst_batch_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.batches%ROWTYPE; d public.batches%ROWTYPE; v_no text;
BEGIN
  SELECT * INTO s FROM public.batches WHERE id=_src_batch_id AND tenant_id=_tenant_id FOR UPDATE;
  SELECT * INTO d FROM public.batches WHERE id=_dst_batch_id AND tenant_id=_tenant_id FOR UPDATE;
  IF s.id IS NULL OR d.id IS NULL THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF s.product_id<>d.product_id OR s.expiry_date IS DISTINCT FROM d.expiry_date OR s.purchase_price<>d.purchase_price THEN
    RAISE EXCEPTION 'Merge requires same product, expiry and cost';
  END IF;
  v_no := 'MRG-'||to_char(now(),'YYYYMMDDHH24MISS');
  UPDATE public.batches SET qty_on_hand=d.qty_on_hand+s.qty_on_hand, updated_at=now() WHERE id=d.id;
  UPDATE public.batches SET qty_on_hand=0, status='merged', updated_at=now() WHERE id=s.id;
  INSERT INTO public.stock_movements(tenant_id,product_id,batch_id,movement_type,qty_change,qty_after,reference_table,reference_no,user_id,notes)
  VALUES
    (_tenant_id,s.product_id,s.id,'adjustment',-s.qty_on_hand,0,'batch_merge',v_no,auth.uid(),'merged into '||d.id),
    (_tenant_id,d.product_id,d.id,'adjustment', s.qty_on_hand,d.qty_on_hand+s.qty_on_hand,'batch_merge',v_no,auth.uid(),'merged from '||s.id);
  INSERT INTO public.audit_log(tenant_id,user_id,action,entity_table,entity_id,after_data)
  VALUES (_tenant_id,auth.uid(),'batch.merge','batches',d.id,jsonb_build_object('src',s.id,'dst',d.id,'qty',s.qty_on_hand,'ref',v_no));
  RETURN d.id;
END $$;

CREATE OR REPLACE FUNCTION public.batch_split(
  _tenant_id uuid, _batch_id uuid, _qty numeric, _new_batch_no text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.batches%ROWTYPE; v_new uuid; v_no text; v_bn text;
BEGIN
  SELECT * INTO s FROM public.batches WHERE id=_batch_id AND tenant_id=_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF _qty <= 0 OR _qty >= s.qty_on_hand THEN RAISE EXCEPTION 'Split qty must be between 0 and %', s.qty_on_hand; END IF;
  v_bn := COALESCE(_new_batch_no, s.batch_no||'-S'||to_char(now(),'HH24MISS'));
  INSERT INTO public.batches(tenant_id,product_id,batch_no,mfg_date,expiry_date,purchase_price,mrp,qty_on_hand,
    branch_id,supplier_id,status,source,created_by,warehouse_id)
  VALUES (_tenant_id,s.product_id,v_bn,s.mfg_date,s.expiry_date,s.purchase_price,s.mrp,_qty,
    s.branch_id,s.supplier_id,'active','split',auth.uid(),s.warehouse_id)
  RETURNING id INTO v_new;
  UPDATE public.batches SET qty_on_hand=qty_on_hand-_qty, updated_at=now() WHERE id=s.id;
  v_no := 'SPL-'||to_char(now(),'YYYYMMDDHH24MISS');
  INSERT INTO public.stock_movements(tenant_id,product_id,batch_id,movement_type,qty_change,qty_after,reference_table,reference_no,user_id,notes)
  VALUES
    (_tenant_id,s.product_id,s.id,'adjustment',-_qty,s.qty_on_hand-_qty,'batch_split',v_no,auth.uid(),'split into '||v_new),
    (_tenant_id,s.product_id,v_new,'adjustment', _qty,_qty,'batch_split',v_no,auth.uid(),'split from '||s.id);
  INSERT INTO public.audit_log(tenant_id,user_id,action,entity_table,entity_id,after_data)
  VALUES (_tenant_id,auth.uid(),'batch.split','batches',s.id,jsonb_build_object('src',s.id,'new',v_new,'qty',_qty,'ref',v_no));
  RETURN v_new;
END $$;

CREATE OR REPLACE FUNCTION public.batch_recall(
  _tenant_id uuid, _batch_id uuid, _reason text, _source text, _notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.batches%ROWTYPE; v_id uuid;
BEGIN
  SELECT * INTO b FROM public.batches WHERE id=_batch_id AND tenant_id=_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Batch not found'; END IF;
  UPDATE public.batches SET status='recalled', updated_at=now() WHERE id=b.id;
  INSERT INTO public.batch_recalls(tenant_id,batch_id,product_id,supplier_id,recall_reason,recall_source,qty_locked,notes,created_by)
  VALUES (_tenant_id,b.id,b.product_id,b.supplier_id,_reason,_source,b.qty_on_hand,_notes,auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO public.notifications(tenant_id,type,title,body,data)
  VALUES (_tenant_id,'batch_recall','Batch recalled','Batch '||b.batch_no||' recalled ('||_reason||')',
    jsonb_build_object('batch_id',b.id,'recall_id',v_id));
  INSERT INTO public.audit_log(tenant_id,user_id,action,entity_table,entity_id,after_data)
  VALUES (_tenant_id,auth.uid(),'batch.recall','batches',b.id,
    jsonb_build_object('recall_id',v_id,'reason',_reason,'source',_source,'qty_locked',b.qty_on_hand));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.supplier_recall(
  _tenant_id uuid, _supplier_id uuid, _reason text, _source text DEFAULT 'supplier', _notes text DEFAULT NULL
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_count int := 0;
BEGIN
  FOR r IN SELECT id FROM public.batches
    WHERE tenant_id=_tenant_id AND supplier_id=_supplier_id AND status='active' AND qty_on_hand>0
  LOOP
    PERFORM public.batch_recall(_tenant_id, r.id, _reason, _source, _notes);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;

GRANT EXECUTE ON FUNCTION public.batch_transfer(uuid,uuid,numeric,uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.batch_adjust(uuid,uuid,numeric,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.batch_merge(uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.batch_split(uuid,uuid,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.batch_recall(uuid,uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supplier_recall(uuid,uuid,text,text,text) TO authenticated;
