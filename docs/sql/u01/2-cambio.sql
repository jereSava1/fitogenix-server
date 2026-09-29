begin;
set local lock_timeout = '5s';
drop policy if exists "Anyone can read products" on public.products;
revoke all on table public.products, public.products_staging from anon, authenticated, public;
revoke execute on function public.search_products_by_name(text, integer) from public, anon, authenticated;
grant execute on function public.search_products_by_name(text, integer) to service_role;
do $$ declare t text; r text; f text := 'public.search_products_by_name(text, integer)'; begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('products', 'products_staging')
             and roles && '{anon,authenticated,public}'::name[]) then raise exception 'U-01: queda una policy abierta'; end if;
  foreach t in array '{public.products,public.products_staging}'::text[] loop
    foreach r in array '{anon,authenticated}'::text[] loop
      if has_table_privilege(r, t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then raise exception 'U-01: % conserva privilegios sobre %', r, t; end if;
      if has_function_privilege(r, f, 'EXECUTE') then raise exception 'U-01: % puede ejecutar la RPC', r; end if;
    end loop;
    if not (has_table_privilege('service_role', t, 'SELECT') and has_table_privilege('service_role', t, 'INSERT')
        and has_table_privilege('service_role', t, 'UPDATE') and has_table_privilege('service_role', t, 'DELETE'))
      then raise exception 'U-01: service_role sin SELECT/INSERT/UPDATE/DELETE sobre %', t; end if;
  end loop;
  if not has_function_privilege('service_role', f, 'EXECUTE') then raise exception 'U-01: service_role no puede ejecutar la RPC'; end if;
end $$;
notify pgrst, 'reload schema';
commit;
