-- 007_username_availability.sql
-- Chequeo de disponibilidad de username SIN exponer filas de profiles.
--
-- Contexto: la RLS de `profiles` solo deja a un usuario ver/editar su PROPIA
-- fila (id = auth.uid()). Por eso el chequeo del cliente (SELECT por username
-- ajeno) devolvía vacío y marcaba el username como "disponible" aunque
-- estuviera tomado — bug de UX. La unicidad real ya la garantiza el UNIQUE
-- sobre profiles.username (un update duplicado tira 23505), pero el indicador
-- en vivo mentía.
--
-- Esta función SECURITY DEFINER consulta profiles bypasseando RLS pero SOLO
-- devuelve un boolean (no expone ninguna fila). El cliente la llama por RPC:
--   supabase.rpc('is_username_available', { candidate })
-- Sirve tanto para el signup (anon, sin sesión) como para editar el perfil
-- (authenticated). El caso "es mi propio username actual" lo resuelve el
-- cliente antes de llamar (no marca en uso el que ya tenías).
--
-- NOTA: aplicar a mano en el SQL Editor de Supabase.

CREATE OR REPLACE FUNCTION public.is_username_available(candidate text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE lower(username) = lower(trim(candidate))
  );
$$;

-- Que solo la puedan ejecutar los roles de la app (no `public` a secas).
REVOKE ALL ON FUNCTION public.is_username_available(text) FROM public;
GRANT EXECUTE ON FUNCTION public.is_username_available(text) TO anon, authenticated;
