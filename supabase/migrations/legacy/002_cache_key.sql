-- 002_cache_key.sql
-- Clave de cache UNIFICADA para productos con y sin barcode.
--
-- Contexto: hasta ahora la caché se keyeaba por `barcode`, así que los productos
-- resueltos SOLO por IA (búsqueda por nombre sin match en OpenFoodFacts) no se
-- podían cachear (no tienen barcode) y cada búsqueda idéntica volvía a gastar IA.
--
-- A partir de acá cacheService usa `cache_key` como clave de upsert:
--   • producto con barcode        → cache_key = <barcode>
--   • producto solo-IA (por nombre) → cache_key = 'name:<nombre normalizado>', barcode = null
--
-- Guardado idempotente con DO/EXCEPTION para no repetir el footgun de 001
-- (ADD CONSTRAINT sin guard abortaba la migración si ya existía).

ALTER TABLE products ADD COLUMN IF NOT EXISTS cache_key text;

-- Backfill: las filas existentes (todas con barcode) usan su barcode como clave.
UPDATE products SET cache_key = barcode WHERE cache_key IS NULL AND barcode IS NOT NULL;

-- Unicidad de la clave → habilita upsert onConflict:'cache_key'.
DO $$ BEGIN
  ALTER TABLE products ADD CONSTRAINT products_cache_key_key UNIQUE (cache_key);
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;
