-- U-01 · 1. VERIFICACIÓN (solo lectura). Se corre antes (V) y después (P) del cambio.
-- Cinco consultas cortas e independientes: pegar y correr UNA por vez, sin texto
-- seleccionado. Qué se espera en cada una: README.md.

-- 1A · Permisos efectivos por tabla y rol + grants directos a PUBLIC
select c.relname as tabla, c.relrowsecurity as rls, r.rol,
  (select string_agg(p, ',' order by p) from unnest('{SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER}'::text[]) p
    where has_table_privilege(r.rol, c.oid, p)) as privilegios,
  (select count(*) from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a where a.grantee = 0) as grants_public
from pg_class c cross join (values ('anon'), ('authenticated'), ('service_role')) r (rol)
where c.oid in ('public.products'::regclass, 'public.products_staging'::regclass)
order by 1, 3;

-- 1B · Policies del catálogo
select tablename, policyname, cmd, roles, qual
from pg_policies
where schemaname = 'public' and tablename in ('products', 'products_staging');

-- 1C · Funciones de public (sin extensiones) que nombran el catálogo, y quién las ejecuta
select p.oid::regprocedure as firma, p.prosecdef as security_definer,
  exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
          where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public_exec,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role
from pg_proc p
where p.pronamespace = 'public'::regnamespace and p.prosrc ~* '\m(products|products_staging)\M'
  and not exists (select 1 from pg_depend e where e.classid = 'pg_proc'::regclass and e.objid = p.oid and e.deptype = 'e');

-- 1D · Vistas que leen el catálogo, ACL crudas y default privileges de public
select distinct 'vista' as tipo, v.relname::text as objeto, null as acl
from pg_depend d join pg_rewrite rw on rw.oid = d.objid and d.classid = 'pg_rewrite'::regclass
join pg_class v on v.oid = rw.ev_class
where d.refobjid in ('public.products'::regclass, 'public.products_staging'::regclass)
  and v.relname not in ('products', 'products_staging')
union all
select 'acl_tabla', relname::text, relacl::text from pg_class
where oid in ('public.products'::regclass, 'public.products_staging'::regclass)
union all
select 'default_privileges', pg_get_userbyid(defaclrole) || ' · ' || defaclobjtype::text, defaclacl::text
from pg_default_acl where defaclnamespace = 'public'::regnamespace;

-- 1E · Muestra para el smoke del server (filas 1-2 antes del cambio, 3-4 después)
select barcode, product_name from public.products
where barcode is not null and length(product_name) between 8 and 60
order by random() limit 4;
