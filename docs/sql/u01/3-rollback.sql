-- U-01 · Rollback: vuelve al estado anterior, INCLUIDA la exposición del catálogo.
-- Solo si falla el smoke del server. Pegar entero y correr sin selección.
-- Los 8 privilegios son los que dio la 1A en producción el 2026-09-29
-- (Postgres 17: incluye MAINTAIN, que el relevamiento de docs/raw no miraba).
-- La 1C de antes dio public_exec = true, así que la línea PUBLIC va.
begin;
set local lock_timeout = '5s';
create policy "Anyone can read products" on public.products for select to anon, authenticated using (true);
grant select, insert, update, delete, truncate, references, trigger, maintain on table public.products, public.products_staging to anon, authenticated;
grant execute on function public.search_products_by_name(text, integer) to anon, authenticated;
grant execute on function public.search_products_by_name(text, integer) to public; -- PUBLIC
commit;
