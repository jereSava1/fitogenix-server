# ADR-0010 · El server como única puerta de entrada del cliente

- **Estado:** Aceptado (D-28) · implementado
- **Fecha:** 2026-09-28
- **Relacionado:** ADR-0005, ADR-0008, D-30, D-90, RF-020 a RF-029
- **Riesgo:** ALTO: todo cambio va con tests de caracterización.

## Contexto

Hoy native habla con **dos** backends:

| Destino | Qué hace native |
|---|---|
| fitogenix-server | Lookup, imagen, guardados, historial |
| Supabase directo (anon key embebida en la app) | Registro, login con email, Google y Apple, recuperación de contraseña, sesión (`getSession`, refresh automático), lectura y edición de `profiles`, RPC `is_username_available` |

Consecuencias: la anon key viaja en la app (y con ella la puerta a SEC-01); hay dos lugares donde aplicar rate limits, logs y reglas; el cliente conoce el esquema de la base (`profiles`, nombres de columnas, RPCs); y cambiar de proveedor de auth obliga a reescribir la app.

**Decisión de producto (D-28):** el cliente **no** hace requests directas a Supabase. Todo pasa por el server.

## Decisión

1. **Native solo conoce la URL del server.** Se elimina `@supabase/supabase-js` de la app y la anon key deja de estar en el bundle.
2. **Nuevo módulo `auth`** en el server, que envuelve Supabase Auth: registro, disponibilidad de username, login con email, Google y Apple (el idToken se sigue obteniendo en el dispositivo), refresh, logout y recuperación de contraseña. Las rutas están en el contrato (`/v1/auth/*`).

   Respuesta de sesión: `{ accessToken, refreshToken, expiresAt, user: { id, email } }`. Los tokens siguen siendo los de Supabase Auth: el server no emite tokens propios.
3. **El módulo `account` suma el perfil:** `GET /users/me/profile` y `PATCH /users/me/profile` (reemplazan el `select`/`update` directo a `profiles`), además de `DELETE /users/me` y `POST /users/me/onboarding`.
4. **Native guarda los tokens en almacenamiento seguro** (`expo-secure-store`, no AsyncStorage) y refresca con `/auth/refresh` cuando el access token está por vencer o ante un 401.
5. **Supabase queda cerrado para `anon`:** sin grants sobre ninguna tabla ni función de `public` (se amplía el fix de SEC-01). `is_username_available` pasa a ejecutarse solo con la secret key del server. RLS queda activo como segunda barrera.
6. **Salvaguardas por manejar credenciales:**
   - Los bodies de `/auth/*` **nunca** se loguean (redact de `password`, `refreshToken`, `idToken`, `code`).
   - Rate limit **propio y más estricto** en `/auth/*`: por IP y por email (fuerza bruta, enumeración, abuso de envío de mails).
   - Las llamadas a Supabase Auth se hacen **sin estado**: el cliente de Supabase del server nunca guarda una sesión en memoria (`persistSession: false`, `autoRefreshToken: false`), para no mezclar usuarios entre requests.
   - La validación del access token en las rutas privadas sigue según ADR-0008.

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| Mantener auth y perfil directo a Supabase (lo que proponía ADR-0005) | Contradice D-28: dos puntos de entrada, anon key en la app, cliente acoplado al esquema |
| Que el server emita sus propios tokens (sesión propia sobre Supabase) | Duplica la gestión de sesiones y revocación sin beneficio: Supabase Auth ya lo hace |
| Proxy transparente de las URLs de Supabase Auth | Expone la API de Supabase tal cual (el cliente sigue acoplado al proveedor) y no permite aplicar reglas propias |

## Consecuencias

- **+** Un solo punto de entrada: rate limit, logs, validación y observabilidad en un lugar.
- **+** La app no sabe que existe Supabase: cambiar de proveedor de auth o de base no toca el cliente.
- **+** Se puede cerrar por completo el acceso `anon` a la base.
- **−** **El server pasa a estar en el camino del login.** Si el server no responde, nadie puede iniciar sesión (antes el login seguía andando). Esto refuerza D-18 (instancia siempre encendida antes de publicar).
- **−** Los límites por IP de Supabase Auth verían la IP del server: se resuelve con D-30 (abajo).
- **−** El server maneja contraseñas en tránsito: exige HTTPS (lo da el proveedor) y las salvaguardas del punto 6.
- **−** Más superficie en el server: 8 endpoints de auth + 2 de perfil, cada uno con schema de request y response, tests de contrato y de errores (credenciales inválidas, email no confirmado, código vencido, usuario existente, rate limit).
- **−** Cambio grande en native: sale el SDK de Supabase, entra un cliente de auth propio con almacenamiento seguro y refresh. 

## Límites de Supabase Auth

Supabase Auth limita registros, logins, refresh y códigos **por IP**. Si todo llega desde la IP del server, esos límites se comparten entre todos los usuarios. **D-30:** el server manda la IP real del usuario en `Sb-Forwarded-For` (con *IP Address Forwarding* activado en el dashboard y la secret key), y esa IP sale de `request.ip` con `TRUST_PROXY` configurado, nunca de un header crudo del cliente. Así los límites vuelven a ser por usuario y el rate limit del server en `/auth/*` queda como primera barrera.

El envío de emails tiene un límite **por proyecto**, independiente de este ADR: para publicar hace falta SMTP propio (L-03).
