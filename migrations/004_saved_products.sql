-- 004_saved_products.sql
-- Productos guardados por usuario (favoritos / bookmarks).
--
-- Contexto: el cliente marca productos como guardados desde la pantalla de
-- resultados. Cada guardado referencia la fila cacheada en `products` vía
-- `cache_key` (la clave unificada de 002: barcode o 'name:<nombre normalizado>'),
-- así el listado de guardados se sirve con un solo embed de PostgREST
-- (saved_products → products) y se recomputa el score con los crudos, igual
-- que un hit de cache. Rutas: GET/POST /users/me/saved y
-- DELETE /users/me/saved/:cacheKey (src/routes/users/saved.ts).
--
-- UNIQUE (user_id, cache_key) habilita el upsert idempotente con
-- onConflict:'user_id,cache_key'. Los ON DELETE CASCADE limpian guardados al
-- borrar la cuenta (auth.users) o al purgar un producto del cache.
--
-- NOTA: aplicar a mano en el SQL Editor de Supabase (el service-role vía
-- PostgREST no ejecuta DDL).

CREATE TABLE IF NOT EXISTS saved_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cache_key text NOT NULL REFERENCES products(cache_key) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, cache_key)
);

-- Listado por usuario ordenado por guardado más reciente primero.
CREATE INDEX IF NOT EXISTS saved_products_user_idx
  ON saved_products (user_id, created_at DESC);

-- RLS como defensa en profundidad: el server usa service-role (bypasea RLS),
-- pero si algún día un cliente habla directo con PostgREST solo puede ver y
-- tocar SUS guardados. Guards DO/EXCEPTION para que la migración sea
-- re-ejecutable (CREATE POLICY no soporta IF NOT EXISTS).
ALTER TABLE saved_products ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY saved_products_select_own ON saved_products
    FOR SELECT USING (user_id = auth.uid());
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY saved_products_insert_own ON saved_products
    FOR INSERT WITH CHECK (user_id = auth.uid());
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY saved_products_delete_own ON saved_products
    FOR DELETE USING (user_id = auth.uid());
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
