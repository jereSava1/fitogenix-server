-- 005_scan_history.sql
-- Historial de escaneos por usuario.
--
-- Contexto: cada lookup autenticado (POST /products/lookup con Bearer token)
-- registra el escaneo en background, sin bloquear la respuesta. Cada fila
-- referencia el producto cacheado en `products` vía `cache_key` (la clave
-- unificada de 002: barcode o 'name:<nombre normalizado>'), así el listado
-- se sirve con un solo embed de PostgREST (scan_history → products) y se
-- recomputa el score con los crudos, igual que un hit de cache.
-- Ruta: GET /users/me/history (src/routes/users/history.ts).
--
-- Re-escanear un producto NO agrega fila: el upsert con
-- onConflict:'user_id,cache_key' ACTUALIZA scanned_at → la tabla queda
-- acotada a productos distintos por usuario (UNIQUE user_id, cache_key).
-- Los ON DELETE CASCADE limpian el historial al borrar la cuenta
-- (auth.users) o al purgar un producto del cache.
--
-- NOTA: aplicar a mano en el SQL Editor de Supabase (el service-role vía
-- PostgREST no ejecuta DDL).

CREATE TABLE IF NOT EXISTS scan_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cache_key text NOT NULL REFERENCES products(cache_key) ON DELETE CASCADE,
  scanned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, cache_key)
);

-- Listado por usuario ordenado por escaneo más reciente primero.
CREATE INDEX IF NOT EXISTS scan_history_user_idx
  ON scan_history (user_id, scanned_at DESC);

-- RLS como defensa en profundidad: el server usa service-role (bypasea RLS),
-- pero si algún día un cliente habla directo con PostgREST solo puede ver y
-- tocar SU historial. El UPDATE es necesario porque re-escanear actualiza
-- scanned_at vía upsert. Guards DO/EXCEPTION para que la migración sea
-- re-ejecutable (CREATE POLICY no soporta IF NOT EXISTS).
ALTER TABLE scan_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY scan_history_select_own ON scan_history
    FOR SELECT USING (user_id = auth.uid());
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY scan_history_insert_own ON scan_history
    FOR INSERT WITH CHECK (user_id = auth.uid());
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY scan_history_update_own ON scan_history
    FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY scan_history_delete_own ON scan_history
    FOR DELETE USING (user_id = auth.uid());
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
