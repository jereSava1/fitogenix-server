-- B-02 (D-46): el perfil lo crea el server al registrar (F-02).
DROP TRIGGER IF EXISTS "on_auth_user_created" ON "auth"."users";
DROP FUNCTION IF EXISTS "public"."handle_new_user"();
