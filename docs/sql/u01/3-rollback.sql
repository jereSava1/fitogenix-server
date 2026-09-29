-- U-01 · Rollback: vuelve al estado anterior, INCLUIDA la exposición del catálogo.
-- Solo si falla el smoke del server. Pegar entero y correr sin selección.
-- Los 7 privilegios son los del schema real (docs/raw/supabase-schema.json).
-- La línea marcada PUBLIC va solo si en la 1C de antes public_exec dio true.
begin;
set local lock_timeout = '5s';
create policy "Anyone can read products" on public.products for select to anon, authenticated using (true);
grant select, insert, update, delete, truncate, references, trigger on table public.products, public.products_staging to anon, authenticated;
grant execute on function public.search_products_by_name(text, integer) to anon, authenticated;
grant execute on function public.search_products_by_name(text, integer) to public; -- PUBLIC
commit;
