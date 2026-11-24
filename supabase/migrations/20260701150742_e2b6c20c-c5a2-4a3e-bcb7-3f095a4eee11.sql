
-- Restrict printing policies to authenticated role only
ALTER POLICY print_health_log_tenant_all ON public.print_health_log TO authenticated;
ALTER POLICY print_jobs_tenant_all ON public.print_jobs TO authenticated;
ALTER POLICY printing_label_templates_read ON public.printing_label_templates TO authenticated;
ALTER POLICY printing_label_templates_write ON public.printing_label_templates TO authenticated;
ALTER POLICY printing_printer_profiles_tenant_all ON public.printing_printer_profiles TO authenticated;
ALTER POLICY printing_settings_tenant_all ON public.printing_settings TO authenticated;
