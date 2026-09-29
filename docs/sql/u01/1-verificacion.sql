-- U-01 · Verificación (solo lectura). Ver README.md de esta carpeta.
-- Seis consultas cortas e independientes (1A a 1F). Correr UNA POR VEZ:
-- pegar solo esa consulta en una pestaña nueva del SQL Editor y correrla
-- sin texto seleccionado. Se corren antes (V) y después (P) del cambio.


-- 1A · Permisos directos sobre las dos tablas (una fila por rol)
select c.relname as tabla,
       c.relrowsecurity as rls,
       coalesce(nullif(a.grantee, 0)::regrole::text, 'PUBLIC') as rol,
       string_agg(a.privilege_type, ',' order by a.privilege_type) as privilegios
from pg_class c, aclexplode(c.relacl) a
where c.oid in ('public.products'::regclass, 'public.products_staging'::regclass)
group by 1, 2, 3
order by 1, 3;


-- 1B · Policies de las dos tablas
select tablename, policyname, cmd, roles, qual
from pg_policies
where schemaname = 'public'
  and tablename in ('products', 'products_staging');


-- 1C · Funciones de public que leen el catálogo, y quién puede ejecutarlas
select p.oid::regprocedure as funcion,
       p.prosecdef as security_definer,
       has_function_privilege('public', p.oid, 'EXECUTE') as public_exec,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and (p.prosrc ilike '%products%' or p.prorettype = 'public.products'::regtype);


-- 1D · Vistas que dependen de las dos tablas (se espera 0 filas)
select distinct v.oid::regclass as vista, v.relkind
from pg_depend d
join pg_rewrite w on w.oid = d.objid
join pg_class v on v.oid = w.ev_class
where d.refobjid in ('public.products'::regclass, 'public.products_staging'::regclass)
  and v.oid <> d.refobjid;


-- 1E · Default privileges de public (informativo: U-01 no los cambia, D-60)
select pg_get_userbyid(defaclrole) as dueno,
       defaclobjtype as tipo,
       defaclacl as acl
from pg_default_acl
where defaclnamespace = 'public'::regnamespace
order by 1, 2;


-- 1F · Cuatro productos al azar para el smoke del server (solo antes)
select barcode, product_name
from products
where barcode ~ '^[0-9]{8,14}$'
  and length(product_name) between 5 and 40
order by random()
limit 4;
