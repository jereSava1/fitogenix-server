-- 008_engine_version_index.sql
-- Índice en engine_version + documentación de la identidad de producto.
--
-- Contexto: el schema de identidad pedido para esta etapa (id uuid como PK
-- estable, `barcode` UNIQUE nullable, `name_key` UNIQUE nullable, columna
-- `engine_version`, upgrade name→barcode conservando el id) YA ESTÁ
-- IMPLEMENTADO — no en esta migración, sino en las anteriores:
--   • products.id (uuid, PK, default gen_random_uuid()) existe desde antes
--     de 001 y es la identidad desde 006_product_identity.sql.
--   • products.barcode UNIQUE nullable → 001_product_cache.sql.
--   • products.name_key UNIQUE nullable → 006_product_identity.sql.
--   • products.engine_version → 001_product_cache.sql (poblada en cada
--     upsert con ENGINE_VERSION de src/domain/product/ftgEngine.ts).
--   • Upgrade name→barcode conservando el id → NO es una regla de DB, es
--     lógica de aplicación en cacheService.setCachedProduct/
--     findUpgradableNameRow (fitogenix-server/src/services/cacheService.ts):
--     antes de upsertear por barcode, busca una fila SIN barcode cuyo
--     product_name normalizado matchee exacto y la actualiza in-place
--     (UPDATE ... WHERE id = <upgradableId>), preservando product_id para
--     que saved_products/scan_history no pierdan la referencia.
--
-- Esta migración 008 SOLO agrega lo que faltaba para que el futuro Agente
-- ETL (06-agente-etl-data.md) y el Agente de Datos (05-agente-datos.md)
-- puedan operar sobre engine_version de forma eficiente y para que el schema
-- quede autodocumentado en el propio catálogo de Postgres:
--   1. Índice en engine_version — sin él, "encontrar todas las filas con un
--      engine_version viejo para recomputar/revalidar" es un seq scan sobre
--      toda la tabla `products`. Cubre tanto `= 'ftg-rubric-vN'` como
--      `IS NULL` (filas cacheadas antes de 001, todavía sin versión).
--   2. Índice en data_source — el Agente ETL y el Agente de Datos necesitan
--      encontrar rápido las filas `data_source = 'ai'` (las más volátiles:
--      TTL de Redis más corto, candidatas a revalidación contra OFF cuando
--      el producto real aparece después).
--   3. COMMENT ON COLUMN — documentación embebida en el catálogo de Postgres
--      (visible en el Table Editor de Supabase) para que cualquier agente o
--      humano que abra la tabla entienda la semántica sin tener que leer
--      migraciones viejas.
--
-- Idempotente: CREATE INDEX IF NOT EXISTS + COMMENT ON (siempre reemplaza,
-- no falla si ya existe). Seguro de re-correr.

CREATE INDEX IF NOT EXISTS products_engine_version_idx
  ON products (engine_version);

CREATE INDEX IF NOT EXISTS products_data_source_idx
  ON products (data_source);

COMMENT ON COLUMN products.id IS
  'Identidad estable del producto (uuid). No cambia nunca, ni siquiera cuando la fila hace upgrade de name_key a barcode. Es lo que referencian saved_products.product_id y scan_history.product_id.';

COMMENT ON COLUMN products.barcode IS
  'Atributo de búsqueda opcional (UNIQUE, nullable). Presente cuando el producto matcheó por código de barras (OFF/OBF/Edamam o IA con barcode como hint). Null en filas resueltas solo por nombre vía IA.';

COMMENT ON COLUMN products.name_key IS
  'Atributo de búsqueda opcional (UNIQUE, nullable). Query de texto normalizado (minúsculas, sin acentos, espacios colapsados — ver queryNormalization.ts) SIN prefijo, que originó una fila resuelta SOLO por IA (sin match en OFF). Permite servir la segunda búsqueda idéntica por nombre desde cache sin invocar a Claude. Se conserva como alias si la fila hace upgrade a barcode.';

COMMENT ON COLUMN products.engine_version IS
  'Versión del motor de scoring (ftgEngine.ENGINE_VERSION, ej. "ftg-rubric-v1") vigente cuando se escribió/refrescó esta fila. Filas con un valor distinto al ENGINE_VERSION actual (o NULL, para filas pre-001) tienen un score potencialmente obsoleto — candidatas a recompute por el Agente ETL o a invalidación selectiva por el Agente de Datos.';

COMMENT ON COLUMN products.data_source IS
  'Proveedor original del dato crudo: off | obf | edamam | ai. "ai" son las filas más volátiles (inventadas por Claude sin respaldo de una base pública) — TTL de Redis más corto (3 días vs 7) y candidatas a revalidación si el producto real aparece después en OFF.';

COMMENT ON TABLE products IS
  'Caché persistente de productos. Guarda datos CRUDOS (ingredients_text, nutriments, nova_group, additives_tags) para recomputar el score con el ftgEngine vigente en cada lectura, no el score ya calculado. Identidad = id (uuid); barcode y name_key son atributos de búsqueda opcionales y mutuamente no excluyentes (una fila upgradeada de name→barcode conserva ambos).';
