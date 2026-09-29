-- 009_products_staging.sql
-- Zona de aterrizaje (staging) para la ingesta masiva de datos (Agente ETL).
--
-- Contexto: la ingesta masiva (dump de OFF + scrapers de retailers, ver
-- 06-agente-etl-data.md) trae datos de MÚLTIPLES fuentes que pueden llegar en
-- corridas distintas, en días distintos. `products` (la tabla real, la que
-- sirve el servidor) nunca debe recibir un adapter crudo directo: necesita
-- pasar antes por el merge por barcode + el gate de completitud + el
-- enriquecimiento de gaps (Fase 3 del pipeline del Agente ETL).
--
-- `products_staging` es ese banco de trabajo intermedio:
--   • Cada adapter (OFF, Carrefour, Jumbo/Disco/Vea, sintético) INSERTA acá
--     su `RawOFFProduct` ya adaptado, tal cual, SIN mergear con nada.
--   • A propósito NO tiene UNIQUE en `barcode`: varias filas del mismo
--     barcode, una por fuente, deben poder convivir — el merge las lee juntas
--     (agrupadas por barcode) para elegir el mejor valor de cada campo.
--   • El job de merge las marca `merge_status` a medida que las procesa y
--     `merged_into` apunta al `products.id` resultante, para poder trazar de
--     qué fila(s) de staging salió un producto final (auditoría).
--   • RLS habilitado SIN ninguna policy: cero acceso vía anon/authenticated
--     (PostgREST), coherente con que esta tabla es 100% interna del pipeline
--     ETL y nunca la lee el cliente. El service-role (que usa el Agente ETL)
--     bypasea RLS igual que en el resto de las tablas de escritura server-side.
--
-- NOTA: aplicar a mano en el SQL Editor de Supabase (el service-role vía
-- PostgREST no ejecuta DDL) — mismo patrón que 004/005/006.

CREATE TABLE IF NOT EXISTS products_staging (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source         text NOT NULL,              -- 'off' | 'carrefour' | 'jumbo' | 'disco' | 'vea' | 'synthetic' | ...
  barcode        text,                        -- EAN tal cual vino de la fuente (null si es solo-nombre)
  raw_payload    jsonb NOT NULL,              -- RawOFFProduct ya adaptado (post-adapter, PRE-merge)
  run_id         text NOT NULL,               -- agrupa una corrida — permite auditar/reprocesar un batch entero
  fetched_at     timestamptz NOT NULL DEFAULT now(),
  merge_status   text NOT NULL DEFAULT 'pending',
  discard_reason text,                        -- por qué no pasó el gate de completitud (solo si discarded_*)
  merged_at      timestamptz,
  merged_into    uuid REFERENCES products(id) ON DELETE SET NULL,  -- a qué fila de `products` terminó yendo
  CONSTRAINT products_staging_status_check
    CHECK (merge_status IN ('pending', 'merged', 'discarded_incomplete', 'enriched'))
);

-- El merge agrupa por barcode: sin este índice, cada corrida de merge hace
-- seq scan sobre toda la tabla de staging acumulada.
CREATE INDEX IF NOT EXISTS products_staging_barcode_idx
  ON products_staging (barcode);

-- "Traeme todo lo pendiente de mergear" es la query que corre el job en cada
-- pasada — necesita índice, no es una consulta ocasional.
CREATE INDEX IF NOT EXISTS products_staging_status_idx
  ON products_staging (merge_status);

-- Para poder auditar/reintentar una corrida específica sin tocar el resto.
CREATE INDEX IF NOT EXISTS products_staging_run_id_idx
  ON products_staging (run_id);

ALTER TABLE products_staging ENABLE ROW LEVEL SECURITY;
-- Sin CREATE POLICY a propósito: RLS habilitado + cero policies = acceso
-- denegado para anon/authenticated vía PostgREST. El service-role (Agente
-- ETL, mismo cliente que usa cacheService.ts) sigue teniendo acceso total
-- porque bypasea RLS — no hace falta una policy explícita para él.

COMMENT ON TABLE products_staging IS
  'Banco de trabajo del Agente ETL. Datos crudos ya adaptados a RawOFFProduct, de una o más fuentes, ANTES del merge por barcode y el gate de completitud. Nunca la lee el servidor de producción ni el cliente — solo el pipeline de ingesta. Ver 06-agente-etl-data.md, Fase 3.';

COMMENT ON COLUMN products_staging.merged_into IS
  'products.id de la fila final a la que contribuyó esta fila de staging tras el merge. Null mientras está pending, o si fue descartada por el gate de completitud sin llegar a mergearse.';
