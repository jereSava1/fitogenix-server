-- D-60: lo que se cree de acá en adelante en `public` ya no queda abierto a anon ni a
-- authenticated por defecto; cada migración da los permisos que necesite (ADR-0009). No
-- cambia los objetos que ya existen. EXECUTE a PUBLIC en funciones es global de Postgres:
-- se revoca función por función.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;

-- Rollback:
-- alter default privileges for role postgres in schema public grant all on tables to anon, authenticated;
-- alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated;
-- alter default privileges for role postgres in schema public grant all on functions to anon, authenticated;
