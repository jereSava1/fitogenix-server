begin;
set local lock_timeout = '5s';
grant select, insert, update, delete, truncate, references, trigger on table public.products, public.products_staging to anon, authenticated;
grant execute on function public.search_products_by_name(text, integer) to public, anon, authenticated;
drop policy if exists "Anyone can read products" on public.products;
create policy "Anyone can read products" on public.products for select to anon, authenticated using (true);
notify pgrst, 'reload schema';
commit;
