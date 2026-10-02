-- 006_product_identity.sql
-- Identidad de producto por `products.id` (uuid) — adiós `cache_key`.
--
-- Contexto: hasta ahora la identidad de un producto era `cache_key` (string
-- mixto: el barcode, o 'name:<query normalizado>' para productos resueltos
-- solo por IA — ver 002). Eso acoplaba la identidad al CANAL por el que entró
-- el producto: si un producto entraba por nombre y después se escaneaba por
-- barcode, se duplicaba la fila y los guardados/historial quedaban colgando
-- de la clave vieja.
--
-- A partir de acá:
--   • `products.id` (uuid, ya existía) = la IDENTIDAD. Las FKs de
--     `saved_products` y `scan_history` pasan a `product_id`.
--   • `products.barcode` (UNIQUE nullable) y `products.name_key` (UNIQUE
--     nullable, NUEVA) = atributos de BÚSQUEDA. `name_key` guarda el query
--     normalizado SIN prefijo que originó una fila resuelta por IA (ojo: es
--     el QUERY, no el nombre del producto — la fila con name_key='lays'
--     puede tener product_name='Papas Fritas Clásicas').
--   • `cache_key` desaparece de las tres tablas.
--
-- También se limpian columnas muertas de `products` (ingredients_analysis,
-- nutrition, alternatives) que quedaron de un esquema anterior.
--
-- Guards DO/EXCEPTION para que la migración sea re-ejecutable (mismo patrón
-- que 004/005; ADD CONSTRAINT no soporta IF NOT EXISTS).
--
-- NOTA: aplicar a mano en el SQL Editor de Supabase (el service-role vía
-- PostgREST no ejecuta DDL).

ALTER TABLE products ADD COLUMN IF NOT EXISTS name_key text;
UPDATE products SET name_key = substring(cache_key from 6)
  WHERE cache_key LIKE 'name:%' AND name_key IS NULL;
DO $$ BEGIN
  ALTER TABLE products ADD CONSTRAINT products_name_key_key UNIQUE (name_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
ALTER TABLE saved_products ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES products(id) ON DELETE CASCADE;
UPDATE saved_products sp SET product_id = p.id FROM products p
  WHERE p.cache_key = sp.cache_key AND sp.product_id IS NULL;
DELETE FROM saved_products WHERE product_id IS NULL;
ALTER TABLE saved_products ALTER COLUMN product_id SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE saved_products ADD CONSTRAINT saved_products_user_product_key UNIQUE (user_id, product_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
ALTER TABLE saved_products DROP COLUMN IF EXISTS cache_key;
ALTER TABLE scan_history ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES products(id) ON DELETE CASCADE;
UPDATE scan_history sh SET product_id = p.id FROM products p
  WHERE p.cache_key = sh.cache_key AND sh.product_id IS NULL;
DELETE FROM scan_history WHERE product_id IS NULL;
ALTER TABLE scan_history ALTER COLUMN product_id SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE scan_history ADD CONSTRAINT scan_history_user_product_key UNIQUE (user_id, product_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
ALTER TABLE scan_history DROP COLUMN IF EXISTS cache_key;
ALTER TABLE products
  DROP COLUMN IF EXISTS ingredients_analysis,
  DROP COLUMN IF EXISTS nutrition,
  DROP COLUMN IF EXISTS alternatives,
  DROP COLUMN IF EXISTS cache_key;
