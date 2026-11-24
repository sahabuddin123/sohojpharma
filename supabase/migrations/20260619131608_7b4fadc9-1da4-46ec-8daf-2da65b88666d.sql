
REVOKE EXECUTE ON FUNCTION public.batch_transfer(uuid,uuid,numeric,uuid,uuid,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.batch_adjust(uuid,uuid,numeric,text,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.batch_merge(uuid,uuid,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.batch_split(uuid,uuid,numeric,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.batch_recall(uuid,uuid,text,text,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.supplier_recall(uuid,uuid,text,text,text) FROM PUBLIC;
