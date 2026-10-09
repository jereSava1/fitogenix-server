-- Ola 2 de la purga (D-102): borrar filas de products dispara el ON DELETE SET NULL sobre
-- products_staging.merged_into, que no tiene índice y recorre toda la tabla (timeout).
-- Sin CONCURRENTLY: `supabase db push` corre cada migración en una transacción.
CREATE INDEX IF NOT EXISTS products_staging_merged_into_idx ON public.products_staging (merged_into);

-- Rollback:
-- DROP INDEX IF EXISTS public.products_staging_merged_into_idx;
