-- ════════════════════════════════════════════════════════════════════════
-- U-01 · Cerrar el catálogo a la anon key · 3. ROLLBACK
--
-- Deja la base EXACTAMENTE como estaba antes de 2-cambio.sql (según
-- docs/raw/supabase-schema.json, 2026-09-28), incluida la exposición de
-- SEC-01. Usarlo solo si el smoke del server falla y no hay un arreglo
-- inmediato; después, correr 1-verificacion.sql y comparar `f_acl_crudas`
-- con la corrida previa al cambio.
-- ════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '5s';

-- Los 7 privilegios que anon y authenticated tenían (default de Supabase).
grant select, insert, update, delete, truncate, references, trigger
  on table public.products, public.products_staging
  to anon, authenticated;

-- EXECUTE de la RPC para PUBLIC, anon y authenticated (el de service_role
-- se deja: no expone nada).
grant execute on function public.search_products_by_name(text, integer)
  to public, anon, authenticated;

drop policy if exists "Anyone can read products" on public.products;
create policy "Anyone can read products"
  on public.products
  for select
  to anon, authenticated
  using (true);

notify pgrst, 'reload schema';

commit;
