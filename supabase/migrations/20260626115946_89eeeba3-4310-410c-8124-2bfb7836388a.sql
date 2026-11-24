DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec') THEN
    REVOKE UPDATE ON public.landing_cms FROM sandbox_exec;
  END IF;
END $$;
