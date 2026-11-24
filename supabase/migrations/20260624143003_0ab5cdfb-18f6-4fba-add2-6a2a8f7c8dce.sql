DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='pos_checkout';

  -- Replace the membership guard so app admins are also allowed
  v_def := replace(
    v_def,
    'IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN',
    'IF NOT public.is_tenant_member(auth.uid(), _tenant_id) AND NOT public.is_app_admin(auth.uid()) THEN'
  );

  -- Make it SECURITY DEFINER so RLS doesn''t hide tenant batches from app admins
  v_def := replace(v_def, 'LANGUAGE plpgsql', 'LANGUAGE plpgsql SECURITY DEFINER SET search_path = public');

  EXECUTE v_def;
END $$;