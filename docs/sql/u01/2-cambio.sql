-- ════════════════════════════════════════════════════════════════════════
-- U-01 · Cerrar el catálogo a la anon key · 2. CAMBIO
--
-- SEC-01 · D-08 · RNF-S01 · ADR-0005 / ADR-0010. Rollback: 3-rollback.sql.
--
-- Cuándo: con el ETL parado. Cómo: Supabase → SQL Editor → pegar todo → Run.
-- Es UNA transacción: si cualquier chequeo del final falla, no se aplica nada
-- y el editor muestra el mensaje "U-01: ...". "Success. No rows returned" = OK.
--
-- No toca: `profiles` ni `is_username_available` (los usa native hasta F-12;
-- se cierran en B-03), los grants de `service_role` sobre las tablas, ni RLS.
-- ════════════════════════════════════════════════════════════════════════

begin;

-- DROP POLICY toma un lock exclusivo sobre `products`: si hay una consulta
-- larga en curso, mejor fallar a los 5 s y reintentar que encolar el lookup.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- 1. La policy que abre el catálogo entero a anon y authenticated.
drop policy if exists "Anyone can read products" on public.products;

-- 2. Sin privilegios de tabla: RLS queda como segunda barrera, no como única.
revoke all on table public.products, public.products_staging
  from anon, authenticated, public;

-- 3. La RPC es SECURITY INVOKER: sin la policy devolvería [] a anon, pero el
--    RNF pide un error de permisos. Postgres le da EXECUTE a PUBLIC por
--    default, así que hay que sacarlo también de PUBLIC.
revoke execute on function public.search_products_by_name(text, integer)
  from public, anon, authenticated;

-- El server la llama con la secret key (rol service_role). Si hoy la ejecuta
-- solo a través de PUBLIC, el revoke de arriba lo rompería: grant explícito.
grant execute on function public.search_products_by_name(text, integer)
  to service_role;

-- 4. Chequeos: si algo no quedó como se espera, se aborta todo.
do $$
declare
  t text;
  r text;
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('products', 'products_staging')
      and roles && array['anon', 'authenticated', 'public']::name[]
  ) then
    raise exception 'U-01: queda una policy para anon/authenticated/public sobre el catálogo';
  end if;

  foreach t in array array['public.products', 'public.products_staging'] loop
    foreach r in array array['anon', 'authenticated'] loop
      if has_table_privilege(r, t,
           'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') then
        raise exception 'U-01: % conserva privilegios sobre %', r, t;
      end if;
    end loop;

    if not (has_table_privilege('service_role', t, 'SELECT')
        and has_table_privilege('service_role', t, 'INSERT')
        and has_table_privilege('service_role', t, 'UPDATE')
        and has_table_privilege('service_role', t, 'DELETE')) then
      raise exception 'U-01: service_role no tiene SELECT/INSERT/UPDATE/DELETE sobre % (el server y el ETL se romperían)', t;
    end if;

    if not (select relrowsecurity from pg_class where oid = t::regclass) then
      raise exception 'U-01: RLS no está activo en %', t;
    end if;
  end loop;

  foreach r in array array['anon', 'authenticated'] loop
    if has_function_privilege(r, 'public.search_products_by_name(text, integer)', 'EXECUTE') then
      raise exception 'U-01: % todavía puede ejecutar search_products_by_name', r;
    end if;
  end loop;

  if not has_function_privilege('service_role', 'public.search_products_by_name(text, integer)', 'EXECUTE') then
    raise exception 'U-01: service_role no puede ejecutar search_products_by_name (rompería la búsqueda por nombre)';
  end if;
end
$$;

-- PostgREST chequea permisos en cada request; el reload solo refresca su
-- cache de funciones expuestas. Se envía al confirmar la transacción.
notify pgrst, 'reload schema';

commit;
