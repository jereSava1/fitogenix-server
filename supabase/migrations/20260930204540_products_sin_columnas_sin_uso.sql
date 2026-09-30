-- B-01 (D-35, D-36, D-41, DB-02): el puntaje se calcula al leer; NOVA, name_key y
-- manufacturer_info no los usa nadie. El índice de barcode duplica products_barcode_key.
DROP INDEX IF EXISTS public.products_engine_version_idx;
DROP INDEX IF EXISTS public.products_barcode_unique_idx;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_name_key_key;

ALTER TABLE public.products
  DROP COLUMN IF EXISTS score,
  DROP COLUMN IF EXISTS score_label,
  DROP COLUMN IF EXISTS sello,
  DROP COLUMN IF EXISTS engine_version,
  DROP COLUMN IF EXISTS nova_group,
  DROP COLUMN IF EXISTS name_key,
  DROP COLUMN IF EXISTS manufacturer_info;

COMMENT ON TABLE public.products IS 'Catálogo. Guarda los datos crudos (ingredients_text, nutriments, additives_tags, category) y el puntaje se calcula con el motor vigente en cada lectura. Identidad = id (uuid); barcode es el atributo de búsqueda.';
