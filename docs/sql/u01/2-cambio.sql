-- U-01 · Cambio. Pegar ENTERO en una pestaña nueva y correr sin selección.
-- Si algún chequeo falla, aborta y no queda nada aplicado. Ver README.md.
begin;
set local lock_timeout = '5s';
drop policy if exists "Anyone can read products" on public.products;
revoke all on table public.products, public.products_staging from anon, authenticated, public;
revoke execute on function public.search_products_by_name(text, integer) from anon, authenticated, public;
grant execute on function public.search_products_by_name(text, integer) to service_role;
do $$
declare
  t text;
  p constant text := 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER';
begin
  foreach t in array array['public.products', 'public.products_staging'] loop
    if has_table_privilege('anon', t, p) or has_table_privilege('authenticated', t, p) then
      raise exception 'U-01: anon o authenticated conservan permisos sobre %', t;
    end if;
    if not has_table_privilege('service_role', t, 'SELECT')
       or not has_table_privilege('service_role', t, 'INSERT')
       or not has_table_privilege('service_role', t, 'UPDATE')
       or not has_table_privilege('service_role', t, 'DELETE') then
      raise exception 'U-01: service_role perdió permisos sobre %', t;
    end if;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'products'
             and policyname = 'Anyone can read products') then
    raise exception 'U-01: la policy pública sigue existiendo';
  end if;
  if has_function_privilege('anon', 'public.search_products_by_name(text, integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.search_products_by_name(text, integer)', 'EXECUTE') then
    raise exception 'U-01: anon o authenticated pueden ejecutar search_products_by_name';
  end if;
  if not has_function_privilege('service_role', 'public.search_products_by_name(text, integer)', 'EXECUTE') then
    raise exception 'U-01: service_role no puede ejecutar search_products_by_name';
  end if;
end $$;
commit;
