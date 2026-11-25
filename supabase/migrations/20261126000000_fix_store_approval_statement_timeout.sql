-- Fix "canceling statement due to statement timeout" when approving a store.
-- Previously auto_provision_tenant_on_activation() called provision_catalog_for_tenant(NEW.id, NULL, NULL),
-- which copied the entire global catalog synchronously inside the UPDATE tenants statement.
-- Instead, seed only 200 items synchronously (if a main branch already exists) and let pg_cron
-- process the rest asynchronously, and remove the duplicate branch catalog trigger.

CREATE OR REPLACE FUNCTION public.auto_provision_tenant_on_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_branch uuid;
  v_job_name text;
BEGIN
  IF NEW.status = 'active' AND (OLD.status IS NULL OR OLD.status <> 'active') THEN
    SELECT id INTO v_branch
      FROM public.branches
     WHERE tenant_id = NEW.id
       AND (is_main = true OR branch_role = 'head_office')
       AND deleted_at IS NULL
     ORDER BY created_at ASC
     LIMIT 1;

    IF v_branch IS NOT NULL THEN
      PERFORM public.provision_catalog_for_tenant(NEW.id, v_branch, 200);
      v_job_name := 'catalog-provision-' || v_branch::text;
      BEGIN
        PERFORM cron.unschedule(v_job_name);
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
      BEGIN
        PERFORM cron.schedule(
          v_job_name,
          '* * * * *',
          format('SELECT public.process_catalog_provision_job(%L, %L, %L)', NEW.id, v_branch, v_job_name)
        );
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_auto_catalog_on_branch ON public.branches;
