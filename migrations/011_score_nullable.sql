-- 011_score_nullable.sql
-- `products.score` (y `products.sello`) tienen que aceptar NULL.
--
-- NO APLICADA. Igual que las anteriores: correr a mano en el SQL Editor de
-- Supabase. Está escrita para poder correrse aunque las columnas YA sean
-- nullables (DROP NOT NULL sobre una columna nullable es un no-op), así que es
-- idempotente y segura de re-correr.
--
-- ── Por qué ──
--
-- Desde el motor v2.1 (ADR-002), `score` es `number | null` en el contrato:
-- §1 enumera los casos en que NO se emite puntaje —fuera de alcance (alcohol,
-- no alimentario), sin ingredientes utilizables, lista que no se pudo
-- identificar— y la regla es que "la ausencia de datos nunca mejora un
-- puntaje". Antes se devolvía un número conservador (40) que el cliente no
-- podía distinguir de un 40 calculado; ahora se devuelve null + `noScore` con
-- el motivo.
--
-- `cacheService.buildCachePayload` escribe ese valor tal cual:
--
--     score:       product.score,                    -- puede ser NULL
--     score_label: getScoreLabel(product.score).label -- 'SIN DATOS SUFICIENTES'
--     sello:       getSello(product.score)           -- NULL si no hay puntaje
--
-- Si `score` fuera NOT NULL, el upsert del cold path fallaría para todos esos
-- productos: el lookup los serviría igual (el catch loguea y sigue) pero SIN
-- productId, así que el usuario no podría guardarlos ni quedarían en el
-- historial. Un bug silencioso, y encima concentrado justo en los productos
-- de datos más pobres — que son los que más nos importa poder curar después.
--
-- ── Qué NO se hace acá, a propósito ──
--
-- 1. No se rellenan los scores viejos ni se borran filas. Los puntajes de
--    `ftg-rubric-v2` NO son comparables con los de v2.1, pero `score` es una
--    columna DENORMALIZADA para listados: la verdad se recomputa desde los
--    crudos en cada lectura (rowToCachedRaw + mapOFFToProduct). Se refresca
--    sola a medida que cada producto se vuelve a tocar. El recompute masivo es
--    trabajo del Agente ETL, filtrando por `engine_version` (índice de la
--    migración 008), no de una migración de esquema.
-- 2. No se toca `score_label`: nunca es null (para "sin puntaje" vale
--    'SIN DATOS SUFICIENTES'), así que un NOT NULL ahí no molesta.

ALTER TABLE products ALTER COLUMN score DROP NOT NULL;
ALTER TABLE products ALTER COLUMN sello DROP NOT NULL;

COMMENT ON COLUMN products.score IS
  'Puntaje Fitogenix DENORMALIZADO para listados (0-100), o NULL cuando el motor decide no puntuar (§1 del motor v2.1: fuera de alcance, sin datos suficientes, lista no identificable). NULL NO significa 0: la ausencia de datos nunca mejora ni empeora un puntaje, se declara. La fuente de verdad es el recómputo desde los crudos (ver COMMENT ON TABLE products); esta columna puede estar calculada con un engine_version viejo.';

COMMENT ON COLUMN products.sello IS
  'Sello derivado del score: FITOGÉNICO (>=75), NO FITOGÉNICO (<25), o NULL en el medio y también cuando no hay puntaje — sin datos no ponemos ninguno de los dos.';
