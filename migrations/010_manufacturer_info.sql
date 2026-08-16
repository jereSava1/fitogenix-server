-- 010_manufacturer_info.sql
-- Columna para preservar info de fabricante/razón social/dirección/RNE-RNPA
-- que a veces aparece mezclada en `ingredients_text` por datos corruptos de
-- origen (típicamente carga comunitaria de Open Food Facts, donde alguien
-- pegó la etiqueta completa en vez de solo los ingredientes).
--
-- Contexto: scripts/etl/jobs/fixDataQuality.ts separa esa porción del
-- ingredients_text corrupto en vez de simplemente descartarla al limpiar el
-- campo. Hoy no se usa en el scoring (ftgEngine) ni se muestra en la app —
-- es preservación de un dato real por si sirve más adelante (trazabilidad,
-- verificación de origen, futuro filtro "elaborado en Argentina", etc.). Si
-- nunca se usa, no hace daño: es nullable, no tiene índice, no afecta nada
-- del flujo existente.
ALTER TABLE products ADD COLUMN IF NOT EXISTS manufacturer_info text;

COMMENT ON COLUMN products.manufacturer_info IS
  'Info de fabricante/razón social/dirección/RNE-RNPA extraída de ingredients_text corrupto durante la auditoría de calidad de datos (ver scripts/etl/jobs/fixDataQuality.ts). No se usa en scoring ni se muestra en la app hoy — solo preservación de dato real en vez de descartarlo.';
