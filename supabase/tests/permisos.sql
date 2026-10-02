-- Guardián de permisos (R-05): cada fila es una violación y hace fallar el CI.
-- Solo el server (service_role) llega a los datos; anon solo se anota en la waitlist (D-81).
select 'grant en tabla' as problema, grantee || ' ' || privilege_type || ' ' || table_name as detalle
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'PUBLIC')
  and not (table_name = 'waitlist' and privilege_type = 'INSERT')
union all
select 'función ejecutable', r.rol || ' ' || p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join (values ('anon'), ('authenticated')) as r(rol)
where n.nspname = 'public'
  and has_function_privilege(r.rol, p.oid, 'execute')
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
union all
select 'tabla sin RLS', c.relname
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
