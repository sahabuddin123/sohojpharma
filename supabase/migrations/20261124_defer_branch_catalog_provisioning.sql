-- Migration: 20261124_defer_branch_catalog_provisioning.sql
-- Description: Instant branch creation (< 2s) + background catalog drain via pg_cron

CREATE OR REPLACE FUNCTION public.process_catalog_provision_job(
  _tenant_id uuid,
  _branch_id uuid,
  _job_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining int;
BEGIN
  -- If branch deleted or missing, cleanup job
  IF NOT EXISTS (
    SELECT 1 FROM public.branches
    WHERE id = _branch_id AND tenant_id = _tenant_id AND deleted_at IS NULL
  ) THEN
    BEGIN PERFORM cron.unschedule(_job_name); EXCEPTION WHEN OTHERS THEN NULL; END;
    RETURN;
  END IF;

  -- Provision next 10,000 batch
  PERFORM public.provision_catalog_for_tenant(_tenant_id, _branch_id, 10000);

  -- Check if any remaining global medicines not copied yet
  SELECT count(*) INTO v_remaining
  FROM public.global_medicines gm
  WHERE gm.approved = true
    AND NOT EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.tenant_id = _tenant_id
        AND p.deleted_at IS NULL
        AND p.global_medicine_id = gm.id
    );

  -- When fully synced, remove the scheduled cron job
  IF v_remaining = 0 THEN
    BEGIN PERFORM cron.unschedule(_job_name); EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_provision_tenant_catalog_via_branch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_name text := 'catalog-provision-' || NEW.id::text;
BEGIN
  IF NEW.is_main = true THEN
    -- 1. Synchronously provision first 2,000 medicines + all 410 companies + all 1,827 generics + default units/categories
    -- This completes in ~1.5 seconds, so the frontend setup wizard responds immediately!
    PERFORM public.provision_catalog_for_tenant(NEW.tenant_id, NEW.id, 2000);

    -- 2. Schedule pg_cron to drain the remaining catalog in the background every minute until 100% complete
    BEGIN
      PERFORM cron.unschedule(v_job_name);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
      PERFORM cron.schedule(
        v_job_name,
        '* * * * *',
        format('SELECT public.process_catalog_provision_job(%L, %L, %L)', NEW.tenant_id, NEW.id, v_job_name)
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_catalog_provision_job(uuid, uuid, text) TO service_role, postgres;
