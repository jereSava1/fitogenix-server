-- B-03 (D-28, D-90): a los datos de usuario solo llega el server (service_role). Con la key
-- pública y un token de usuario ya no se puede leer ni escribir directo. RLS queda activo.
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "saved_products_delete_own" ON public.saved_products;
DROP POLICY IF EXISTS "saved_products_insert_own" ON public.saved_products;
DROP POLICY IF EXISTS "saved_products_select_own" ON public.saved_products;
DROP POLICY IF EXISTS "scan_history_delete_own" ON public.scan_history;
DROP POLICY IF EXISTS "scan_history_insert_own" ON public.scan_history;
DROP POLICY IF EXISTS "scan_history_select_own" ON public.scan_history;
DROP POLICY IF EXISTS "scan_history_update_own" ON public.scan_history;

REVOKE ALL ON TABLE public.profiles, public.saved_products, public.scan_history
  FROM anon, authenticated, PUBLIC;

-- Sin uso desde F-02: el server chequea el username con su propia consulta.
DROP FUNCTION IF EXISTS public.is_username_available(text);
