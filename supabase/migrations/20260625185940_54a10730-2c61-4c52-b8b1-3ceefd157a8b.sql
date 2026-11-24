create or replace function public.list_public_trusted_tenants(_limit int default 24)
returns table(id uuid, name text, logo_url text)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, t.logo_url
  from public.tenants t
  where coalesce(t.status, 'active') = 'active'
    and t.logo_url is not null
    and length(trim(t.logo_url)) > 0
  order by t.created_at asc
  limit greatest(1, least(_limit, 100));
$$;
revoke all on function public.list_public_trusted_tenants(int) from public;
grant execute on function public.list_public_trusted_tenants(int) to anon, authenticated;