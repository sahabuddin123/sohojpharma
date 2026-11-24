CREATE OR REPLACE FUNCTION public.tenant_member_admin_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_app_admin(NEW.user_id) THEN
    RAISE EXCEPTION 'SaaS Admin users cannot be tenant members'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_member_admin_guard ON public.tenant_members;
CREATE TRIGGER trg_tenant_member_admin_guard
BEFORE INSERT ON public.tenant_members
FOR EACH ROW
EXECUTE FUNCTION public.tenant_member_admin_guard();