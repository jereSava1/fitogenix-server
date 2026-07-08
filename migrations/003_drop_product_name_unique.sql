-- 003_drop_product_name_unique.sql
-- Elimina el índice UNIQUE sobre product_name.
--
-- Contexto: `products` es una CACHÉ keyeada por cache_key (ver 002). Un índice
-- único sobre product_name rompía el cacheo en silencio: dos barcodes distintos
-- con el mismo nombre limpio no podían convivir, y es un caso frecuente porque
-- cleanName() borra tamaños ("Coca-Cola 500ml" y "Coca-Cola 1.5L" → ambos
-- "Coca cola"). El segundo upsert fallaba con duplicate key y el producto nunca
-- se cacheaba → cada búsqueda volvía a gastar OFF/IA.
--
-- La unicidad real la garantizan products_cache_key_key y products_barcode_key.
--
-- NOTA: aplicado a mano en el SQL Editor de Supabase el 2026-07-07; este archivo
-- lo documenta para reproducibilidad.

DROP INDEX IF EXISTS products_product_name_unique_idx;
