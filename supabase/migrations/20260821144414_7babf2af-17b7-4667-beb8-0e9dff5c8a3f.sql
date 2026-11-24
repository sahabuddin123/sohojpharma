ALTER TABLE public.tenant_members DISABLE TRIGGER USER;
ALTER TABLE public.user_roles DISABLE TRIGGER USER;

DO $$
DECLARE v_tenant uuid; v_user uuid := '512a60de-7c19-44f4-9977-8e15e76e37dc';
BEGIN
  SELECT id INTO v_tenant FROM public.tenants WHERE lower(name)='nimel pharma' LIMIT 1;
  IF v_tenant IS NULL THEN
    INSERT INTO public.tenants(name, slug, owner_name, mobile, email, status, plan)
    VALUES ('Nimel Pharma', 'nimel-pharma-'||substr(gen_random_uuid()::text,1,8), 'Nimel', '01700000091', 'nimel@gmail.com', 'active', 'enterprise')
    RETURNING id INTO v_tenant;
  END IF;

  INSERT INTO auth.users (id, aud, role, email)
  VALUES (v_user, 'authenticated', 'authenticated', 'nimel@gmail.com')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.tenant_members(tenant_id, user_id, is_default)
  VALUES (v_tenant, v_user, true) ON CONFLICT (tenant_id, user_id) DO NOTHING;

  INSERT INTO public.user_roles(user_id, tenant_id, role)
  VALUES (v_user, v_tenant, 'owner') ON CONFLICT (user_id, tenant_id, role) DO NOTHING;
END $$;

ALTER TABLE public.tenant_members ENABLE TRIGGER USER;
ALTER TABLE public.user_roles ENABLE TRIGGER USER;