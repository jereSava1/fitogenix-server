-- 010_incomplete_products.sql
-- Separar el gate de DATOS del gate de SCORING.
--
-- Hasta acá, una fila de staging sin ingredientes ni tabla nutricional se
-- marcaba `discarded_incomplete` y no llegaba nunca a `products`. El criterio
-- venía de que sin esos campos no se puede calcular un puntaje — cierto, pero
-- se lleva puesto todo lo demás: nombre, marca, imagen y categoría, que son
-- justamente los datos que a un usuario le permiten reconocer el producto que
-- acaba de escanear.
--
-- El resultado era doblemente malo: el catálogo perdía miles de productos
-- reales, y un escaneo de esos códigos caía a la cascada cara (IA) en vez de
-- resolverse desde nuestra base.
--
-- Desde acá esos productos SÍ entran, marcados como incompletos. El motor ya
-- sabe declarar que no puede puntuar (scoreAvailable/coverage, ver
-- ftgEngine.ts), así que mostrarlos no implica inventar un puntaje.
--
-- NOTA: aplicar a mano en el SQL Editor de Supabase — mismo patrón que las
-- migraciones anteriores.

-- 1. Nuevo estado de staging: mergeado, pero sin datos suficientes para
--    puntuar. Distinto de `discarded_incomplete`, que significaba "no se
--    escribió nada".
ALTER TABLE products_staging
  DROP CONSTRAINT IF EXISTS products_staging_status_check;

ALTER TABLE products_staging
  ADD CONSTRAINT products_staging_status_check
  CHECK (merge_status IN (
    'pending',
    'merged',
    'merged_incomplete',   -- ← nuevo: llegó a products, le faltan datos de scoring
    'discarded_incomplete',
    'enriched'
  ));

COMMENT ON COLUMN products_staging.merge_status IS
  'pending: sin procesar. merged: escrito en products con datos completos. merged_incomplete: escrito en products, pero sin ingredientes ni tabla nutricional suficientes para puntuar — candidato a enriquecimiento. discarded_incomplete: no se escribió (estado histórico, previo a la migración 010). enriched: completado con IA antes de escribirse.';

-- 2. Encontrar rápido los productos a enriquecer. La cola de enriquecimiento
--    ("todos los que no tienen ingredientes utilizables") se consulta en cada
--    corrida del job; sin índice es un seq scan sobre todo el catálogo.
--
--    Índice PARCIAL: solo indexa las filas incompletas, que son una minoría y
--    las únicas que se buscan con este criterio.
CREATE INDEX IF NOT EXISTS products_missing_ingredients_idx
  ON products (updated_at)
  WHERE ingredients_text IS NULL OR length(btrim(ingredients_text)) < 5;

COMMENT ON INDEX products_missing_ingredients_idx IS
  'Cola de enriquecimiento: productos sin lista de ingredientes utilizable. Los llena etl:enrich-cencosud consultando Jumbo/Disco/Vea por EAN (fq=alternateIds_Ean), que publican Ingredientes y Tabla Nutricional reales para ~58% de los casos.';
