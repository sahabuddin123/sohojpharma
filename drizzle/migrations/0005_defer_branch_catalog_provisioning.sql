-- lovable-cron-fallback-reviewed: wake-on-branch-insert queue; each job unschedules immediately after its bounded catalog backlog drains
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
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.branches
    WHERE id = _branch_id AND tenant_id = _tenant_id AND deleted_at IS NULL
  ) THEN
    PERFORM cron.unschedule(_job_name);
    RETURN;
  END IF;

  PERFORM set_config('statement_timeout', '55000', true);

  FOR i IN 1..8 LOOP
    PERFORM public.provision_catalog_for_tenant(_tenant_id, _branch_id, 250);
    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.global_medicines gm
      WHERE gm.approved = true
        AND NOT EXISTS (
          SELECT 1 FROM public.products p
          WHERE p.tenant_id = _tenant_id
            AND p.global_medicine_id = gm.id
            AND p.deleted_at IS NULL
        )
    );
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM public.global_medicines gm
    WHERE gm.approved = true
      AND NOT EXISTS (
        SELECT 1 FROM public.products p
        WHERE p.tenant_id = _tenant_id
          AND p.global_medicine_id = gm.id
          AND p.deleted_at IS NULL
      )
  ) THEN
    PERFORM cron.unschedule(_job_name);
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
  BEGIN
    PERFORM cron.unschedule(v_job_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  PERFORM cron.schedule(
    v_job_name,
    '* * * * *',
    format(
      'SELECT public.process_catalog_provision_job(%L, %L, %L)',
      NEW.tenant_id,
      NEW.id,
      v_job_name
    )
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.process_catalog_provision_job(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_catalog_provision_job(uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.auto_provision_tenant_catalog_via_branch() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_provision_tenant_catalog_via_branch() TO service_role;