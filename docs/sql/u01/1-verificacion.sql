-- ════════════════════════════════════════════════════════════════════════
-- U-01 · Cerrar el catálogo a la anon key · 1. VERIFICACIÓN (solo lectura)
--
-- Se corre DOS veces: antes del cambio (V) y después (P). No escribe nada.
-- Cómo: Supabase → SQL Editor → pegar todo → Run. Devuelve UNA celda con un
-- JSON: copiala entera y pasámela. Qué se espera en cada clave: README.md.
-- ════════════════════════════════════════════════════════════════════════

with
tablas as (
  select c.oid, c.relname, c.relowner, c.relacl, c.relrowsecurity
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('products', 'products_staging')
),
roles (rol) as (
  values ('anon'), ('authenticated'), ('service_role')
),
privs (priv) as (
  values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
         ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
),
funciones as (
  select p.oid, p.proname, p.proowner, p.proacl, p.prosecdef
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'search_products_by_name'
)
select jsonb_pretty(jsonb_build_object(
  'generado_en', now(),

  -- V-A · Policies de `products`. Antes: solo "Anyone can read products".
  'a_policies_products', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'nombre', policyname, 'comando', cmd, 'roles', roles, 'using', qual
    ) order by policyname), '[]'::jsonb)
    from pg_policies
    where schemaname = 'public' and tablename = 'products'
  ),

  -- V-B · RLS activo en las dos tablas (segunda barrera). Siempre: true.
  'b_rls', (
    select jsonb_object_agg(relname, relrowsecurity) from tablas
  ),

  -- V-C · Privilegios efectivos por rol (incluye los heredados de PUBLIC).
  'c_privilegios_tablas', (
    select jsonb_object_agg(t.relname || ' · ' || r.rol, (
      select coalesce(jsonb_agg(p.priv order by p.priv), '[]'::jsonb)
      from privs p
      where has_table_privilege(r.rol, t.oid, p.priv)
    ))
    from tablas t cross join roles r
  ),

  -- V-D · Grants directos a PUBLIC sobre las tablas. Siempre: 0.
  'd_grants_public_tablas', (
    select jsonb_object_agg(t.relname, (
      select count(*)
      from aclexplode(coalesce(t.relacl, acldefault('r', t.relowner))) a
      where a.grantee = 0
    ))
    from tablas t
  ),

  -- V-E · La RPC: cuántas firmas hay y quién la puede ejecutar.
  'e_funcion', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'firma', f.oid::regprocedure::text,
      'security_definer', f.prosecdef,
      'public_execute', exists (
        select 1
        from aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
        where a.grantee = 0 and a.privilege_type = 'EXECUTE'
      ),
      'anon', has_function_privilege('anon', f.oid, 'EXECUTE'),
      'authenticated', has_function_privilege('authenticated', f.oid, 'EXECUTE'),
      'service_role', has_function_privilege('service_role', f.oid, 'EXECUTE')
    )), '[]'::jsonb)
    from funciones f
  ),

  -- V-F · ACL crudas, ordenadas: la foto exacta para comparar con el rollback.
  'f_acl_crudas', jsonb_build_object(
    'tablas', (
      select jsonb_object_agg(t.relname, (
        select jsonb_agg(x order by x) from unnest(t.relacl::text[]) x
      ))
      from tablas t
    ),
    'funcion', (
      select jsonb_agg((
        select jsonb_agg(x order by x) from unnest(f.proacl::text[]) x
      ))
      from funciones f
    )
  ),

  -- V-G · Vistas que leen estas tablas. Esperado: []. Si hay alguna, parar:
  -- una vista SECURITY DEFINER podría seguir exponiendo el catálogo.
  'g_vistas_dependientes', (
    select coalesce(jsonb_agg(distinct v.relname), '[]'::jsonb)
    from pg_depend d
    join pg_rewrite rw on rw.oid = d.objid and d.classid = 'pg_rewrite'::regclass
    join pg_class v on v.oid = rw.ev_class
    where d.refobjid in (select oid from tablas)
      and v.oid not in (select oid from tablas)
  ),

  -- V-H · Otras funciones de `public` (fuera de extensiones) que nombran las
  -- tablas. Esperado: solo search_products_by_name.
  'h_funciones_que_nombran_el_catalogo', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'firma', p.oid::regprocedure::text,
      'security_definer', p.prosecdef,
      'anon', has_function_privilege('anon', p.oid, 'EXECUTE')
    ) order by p.proname), '[]'::jsonb)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosrc ~* '\m(products|products_staging)\M'
      and not exists (
        select 1 from pg_depend e
        where e.classid = 'pg_proc'::regclass and e.objid = p.oid and e.deptype = 'e'
      )
  ),

  -- V-I · Default privileges en `public` (solo informativo: define qué grants
  -- recibe una tabla o función NUEVA; no se cambian en U-01).
  'i_default_privileges_public', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'rol_creador', pg_get_userbyid(d.defaclrole),
      'tipo', case d.defaclobjtype
                when 'r' then 'tablas' when 'f' then 'funciones'
                when 'S' then 'secuencias' else d.defaclobjtype::text end,
      'acl', d.defaclacl::text
    ) order by d.defaclobjtype), '[]'::jsonb)
    from pg_default_acl d
    where d.defaclnamespace = 'public'::regnamespace
  ),

  -- Muestra para el smoke del server: 4 productos al azar (fila 1 y 2 se usan
  -- ANTES del cambio; 3 y 4, DESPUÉS, para que no salgan de Redis).
  'muestra_smoke', (
    select jsonb_agg(jsonb_build_object('barcode', s.barcode, 'nombre', s.product_name))
    from (
      select barcode, product_name
      from public.products
      where barcode is not null
        and product_name is not null
        and length(product_name) between 8 and 60
      order by random()
      limit 4
    ) s
  )
)) as resultado;
