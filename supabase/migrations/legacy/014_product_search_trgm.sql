-- 014_product_search_trgm.sql
-- Búsqueda de texto rápida contra NUESTRO catálogo, sin depender de APIs
-- externas (OpenFoodFacts, IA) para resolver una query.
--
-- Contexto: hasta acá, `findCachedProductByName` hacía
-- `ilike('product_name', '%tok1%tok2%...%')` como paso PREVIO a la IA, no
-- como camino principal — la resolución real pasaba por
-- search.openfoodfacts.org. Un ILIKE con '%' al principio no puede usar un
-- índice btree normal: cada búsqueda por nombre que llegaba a este paso hacía
-- un sequential scan de toda la tabla `products`, y esto empeora a medida que
-- el catálogo crece con el ETL.
--
-- Con el catálogo ahora mucho más grande, la búsqueda por texto pasa a
-- resolverse ACÁ primero y de forma exclusiva — ya no se llama a OFF ni a la
-- IA para encontrar un producto por nombre (ver ADR en BITACORA_DECISIONES.md,
-- 2026-08-18: "búsqueda solo-catálogo"). Si no está en `products`, se
-- responde que todavía no lo tenemos, sin cascada.
--
-- NO APLICADA. Correr a mano en el SQL Editor de Supabase, como las anteriores.

-- pg_trgm: similitud por trigramas de caracteres. Habilita (a) que un GIN
-- index acelere ILIKE '%...%' (el patrón que ya usa el código), y (b) el
-- operador `%`/`similarity()` para rankear resultados por qué tan parecidos
-- son al query, no por qué tan reciente es la fila.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS products_name_trgm_idx
  ON products USING GIN (product_name gin_trgm_ops);

COMMENT ON INDEX products_name_trgm_idx IS
  'Acelera la búsqueda de texto contra el catálogo propio (search_products_by_name / findCachedProductByName): sin este índice, todo ILIKE %...% sobre product_name es un sequential scan de la tabla entera.';

-- RPC: encapsula el ranking por similitud (PostgREST/Supabase-js no puede
-- ordenar por una expresión como similarity() directo en .order()). Devuelve
-- las filas más parecidas al query, mejor match primero — reemplaza el
-- "ORDER BY updated_at DESC" de antes, que no medía relevancia, solo
-- recencia.
--
-- Combina ILIKE (substring, preserva el comportamiento de antes: matchea aunque
-- el query sea un fragmento exacto) con el operador de trigramas `%` (tolera
-- typos y orden distinto de palabras) — cualquiera de los dos alcanza para
-- entrar en el resultado; similarity() decide el orden.
CREATE OR REPLACE FUNCTION search_products_by_name(search_query text, match_limit int DEFAULT 5)
RETURNS SETOF products
LANGUAGE sql
STABLE
AS $$
  SELECT *
  FROM products
  WHERE product_name ILIKE '%' || search_query || '%'
     OR product_name % search_query
  ORDER BY
    similarity(product_name, search_query) DESC,
    (barcode IS NOT NULL) DESC,  -- entre empates, preferimos filas con datos reales (no solo-IA)
    length(product_name) ASC     -- y el nombre más corto (match más ajustado)
  LIMIT match_limit;
$$;

COMMENT ON FUNCTION search_products_by_name IS
  'Búsqueda de texto contra el catálogo propio, rankeada por similitud (pg_trgm). Único mecanismo de resolución por nombre desde 2026-08-18: no hay cascada a OFF/IA si no encuentra nada acá.';
