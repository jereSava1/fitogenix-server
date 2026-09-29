-- 001_product_cache.sql
-- Cache de productos: constraint UNIQUE(barcode) para upsert por barcode +
-- columnas crudas (para recomputar el score con mapOFFToProduct) y metadata.
--
-- Contexto: cacheService.ts hace upsert onConflict:'barcode' y persiste los
-- datos CRUDOS (ingredients_text, nutriments, nova_group, additives_tags) más
-- engine_version / ai_enriched / updated_at. getCachedProduct reconstruye un
-- RawOFFProduct desde estas columnas y trata las filas viejas (sin crudos) como
-- cache miss. Las columnas denormalizadas (product_name, brand, category,
-- image_url, score, score_label, sello, data_source) ya existían en `products`.

ALTER TABLE products ADD CONSTRAINT products_barcode_key UNIQUE (barcode);

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS ingredients_text text,
  ADD COLUMN IF NOT EXISTS nutriments       jsonb,
  ADD COLUMN IF NOT EXISTS nova_group        integer,
  ADD COLUMN IF NOT EXISTS additives_tags    jsonb,
  ADD COLUMN IF NOT EXISTS ai_enriched       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS engine_version    text,
  ADD COLUMN IF NOT EXISTS updated_at        timestamptz DEFAULT now();
