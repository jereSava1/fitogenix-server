# ADR-0010 · El server como única puerta de entrada del cliente

- **Estado:** Aceptado (decisión de producto D-28, 2026-09-28) · implementado el 2026-09-30 (server F-02 a F-07, native F-08 a F-12). Falta cerrar `anon` en la base (B-03) y sacar el trigger (B-02)
- **Fecha:** 2026-09-28
- **Relacionado:** ADR-0005 (revisado por este ADR), ADR-0008, SEC-01, RF-020 a RF-029
- **Riesgo:** ALTO (auth). Requiere tests de caracterización antes y tests de contrato de cada endpoint nuevo.

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
2. **Nuevo módulo `auth`** en el server (sesión e identidad), que envuelve Supabase Auth:

   | Endpoint | Reemplaza en native | Auth |
   |---|---|---|
   | `POST /auth/signup` | `supabase.auth.signUp` (con metadata del perfil) | No |
   | `GET /auth/username-availability?username=` | `rpc('is_username_available')` | No |
   | `POST /auth/login` | `signInWithPassword` | No |
   | `POST /auth/oauth/google` · `POST /auth/oauth/apple` | `signInWithIdToken` (el idToken se sigue obteniendo en el dispositivo con el SDK nativo de Google/Apple) | No |
   | `POST /auth/refresh` | refresh automático del SDK | No (usa el refresh token) |
   | `POST /auth/logout` | `signOut` | Sí |
   | `POST /auth/password/forgot` | `resetPasswordForEmail` | No; responde 202 siempre (no revela si el email existe) |
   | `POST /auth/password/reset` | `verifyOtp` + `updateUser({ password })` | No (usa el código) |

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
- **−** **Límites de Supabase Auth por IP:** todas las llamadas de auth llegan a Supabase desde la IP del server, así que los límites por IP se compartirían entre todos los usuarios. **Mitigación decidida (D-30):** ver la sección "Límites de Supabase Auth" abajo.
- **−** El server maneja contraseñas en tránsito: exige HTTPS (lo da el proveedor) y las salvaguardas del punto 6.
- **−** Más superficie en el server: 8 endpoints de auth + 2 de perfil, cada uno con schema de request y response, tests de contrato y de errores (credenciales inválidas, email no confirmado, código vencido, usuario existente, rate limit).
- **−** Cambio grande en native: sale el SDK de Supabase, entra un cliente de auth propio con almacenamiento seguro y refresh. Se migra por flujo (login → registro → reset → perfil), cada uno en su PR, con los dos caminos conviviendo mientras dura la migración.

## Límites de Supabase Auth (valores del proyecto, 2026-09-28)

Configuración del dashboard (Authentication → Rate Limits), **confirmada** el 2026-09-28.

| Límite | Valor | Alcance | Impacto si todo sale desde la IP del server |
|---|---|---|---|
| Registros + inicios de sesión | 30 cada 5 min (360/h) | **por IP** | **Crítico:** 30 logins o registros cada 5 minutos para **toda** la base de usuarios |
| Refresh de sesión | 150 cada 5 min (1.800/h) | por IP | Alto: cada usuario activo refresca cada ~hora |
| Verificaciones (OTP / códigos de reset) | 30 cada 5 min (360/h) | por IP | Medio |
| Envío de emails | 30 por hora | **por proyecto** (no depende de la IP) | Límite de lanzamiento **independiente de este ADR**: registros + resets de contraseña ≤ 30/h en total. Para salir a tiendas hace falta SMTP propio o subirlo |
| Usuarios anónimos | 30/h por IP | por IP | No aplica (no se usan) |

**Decisión D-30: reenviar la IP real del usuario a Supabase Auth.** El dashboard tiene la opción *"IP Address Forwarding: Clients can forward end-user IP addresses to Auth for rate limiting when using secret API keys"*. El server usa una secret key (`sb_secret_…`), así que:

1. Se activa **Enable IP address forwarding** en el dashboard **antes** de migrar el login al server (acción manual, en el PR de `auth`).
2. El server manda la IP del usuario en cada llamada a Supabase Auth, en el header `Sb-Forwarded-For` (**hecho en F-03**: `supabaseAuthClient(ip)`). Supabase lo respeta solo con la opción activada y con una secret key.
3. **La IP tiene que ser confiable:** Fastify con `trustProxy` configurado para el proxy del proveedor (Render hoy), así `request.ip` es la IP real y no un `X-Forwarded-For` inventado por el cliente. Sin esto, un atacante podría rotar IPs falsas y saltearse los límites de Supabase.
4. Test de contrato: la llamada a Supabase Auth lleva la IP de `request.ip` y nunca un valor que venga crudo del cliente.

Con eso, los límites vuelven a aplicarse **por usuario real**, como hoy, y el rate limit propio del server en `/auth/*` queda como primera barrera.
