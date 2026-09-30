-- La waitlist del sitio: anon y authenticated solo insertan (es lo único que permite su
-- policy). Se les sacan TRUNCATE, TRIGGER, REFERENCES y MAINTAIN, que no necesitan. Leerla
-- sigue siendo solo del server (service_role).
revoke all on table public.waitlist from anon, authenticated;
grant insert on table public.waitlist to anon, authenticated;

-- Rollback:
-- grant references, trigger, truncate, maintain on table public.waitlist to anon, authenticated;
