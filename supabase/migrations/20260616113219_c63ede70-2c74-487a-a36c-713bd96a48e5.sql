-- Unique phone per profile (partial — nulls allowed)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_unique
  ON public.profiles (phone) WHERE phone IS NOT NULL;

-- Extend handle_new_user to persist phone from raw_user_meta_data
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_tenant_id uuid;
  tenant_slug text;
  pharmacy_name text;
BEGIN
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NULLIF(NEW.raw_user_meta_data->>'phone', '')
  );

  pharmacy_name := COALESCE(NEW.raw_user_meta_data->>'pharmacy_name',
                            split_part(NEW.email, '@', 1) || '''s Pharmacy');
  tenant_slug := lower(regexp_replace(pharmacy_name, '[^a-zA-Z0-9]+', '-', 'g'))
                 || '-' || substr(NEW.id::text, 1, 8);

  INSERT INTO public.tenants (name, slug) VALUES (pharmacy_name, tenant_slug)
  RETURNING id INTO new_tenant_id;

  INSERT INTO public.tenant_members (tenant_id, user_id, is_default)
  VALUES (new_tenant_id, NEW.id, true);

  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (NEW.id, new_tenant_id, 'owner');

  PERFORM public.seed_default_chart(new_tenant_id);

  RETURN NEW;
END $function$;