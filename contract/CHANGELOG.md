# Changelog del contrato HTTP

El contrato son dos archivos generados con `npm run contract:generate` ([ADR-0011](../docs/adr/0011-contrato-http-fuente-unica.md)): `contract/openapi.json`, desde los schemas TypeBox de las rutas, y `contract/scoring-bands.json`, las bandas del puntaje desde el motor (D-63). El CI falla si alguno de los archivos commiteados no coincide con lo que se genera (`npm run contract:check`). Todo cambio del archivo se anota acá, con el ítem del plan que lo hizo.

Reglas ([03-contratos.md §B.5](../docs/03-contratos.md)): los cambios aditivos son libres; los que rompen se coordinan con un release de native.

## 0.13.0 — 2026-10-01 · PM-11

**Restringe la entrada de texto (compatible con native actual).** Reglas comunes en `platform/http/schemas.ts`, iguales en native (`presentation/textRules.ts`):

- `firstName` y `lastName` (registro, perfil y `/oauth/apple`): solo letras de cualquier idioma, espacios, apóstrofe, punto y guion, empezando por una letra (antes, cualquier texto con un carácter no blanco).
- Texto libre sin `<`, `>` ni caracteres de control: `query` del lookup (una línea) y `message` de feedback y reportes (con saltos de línea).
- Tokens (`idToken`, `nonce`, `refreshToken`): solo caracteres de token.
- Contraseña: sin cambios a propósito (cualquier carácter).

Lo que no cumple → `400 VALIDATION_ERROR`. Defensa en profundidad contra XSS si estos textos se muestran alguna vez en una web.

## 0.12.0 — 2026-09-30 · F-03

**Aditivo.** Sesión por el server con email, Google y Apple (RF-022/023/024/027, ADR-0010, D-85). Native la usa en F-08.

- **Nuevo componente `Session`**: `{ accessToken, refreshToken, expiresAt, user: { id, email } }`. `expiresAt` en segundos desde epoch; `user.email` puede ser `null` (Apple).
- **Nuevo `POST /v1/auth/login`** `{ email, password }` → `200 Session`. `401 INVALID_CREDENTIALS`, `403 EMAIL_NOT_CONFIRMED`, `429` con `Retry-After` (también tras 5 contraseñas fallidas para ese email en 15 minutos), `400`, `503`.
- **Nuevo `POST /v1/auth/oauth/google`** `{ idToken }` y **`POST /v1/auth/oauth/apple`** `{ idToken, nonce?, firstName?, lastName? }` → `200 Session`, con los mismos errores que el login. `nonce` es el original (sin hashear); `firstName` y `lastName` son los que da Apple la primera vez. El primer inicio de sesión crea la cuenta y el perfil.
- **Nuevo `POST /v1/auth/refresh`** `{ refreshToken }` → `200 Session`; `401 INVALID_REFRESH_TOKEN`, `429`, `400`, `503`.
- **Nuevo `POST /v1/auth/logout`** (con sesión) → `204`; cierra la sesión de ese dispositivo. Cerrarla de nuevo también da `204`.
- **Nuevos códigos de error `INVALID_CREDENTIALS`, `EMAIL_NOT_CONFIRMED` e `INVALID_REFRESH_TOKEN`.**
- Límite: 10 pedidos por minuto por IP en cada ruta.

## 0.11.0 — 2026-09-30 · F-02

**Aditivo.** Registro por el server (RF-020, RF-021, ADR-0010, D-46, D-84). Native lo usa en F-08.

- **Nuevo `POST /v1/auth/signup`** `{ email, password, firstName, lastName, username, phone }` → `201 { status: 'confirmation_required' }`. `password` de 8 a 72; nombre y apellido de 1 a 60 con al menos un carácter visible; `username` de 3 a 30 (`a-z`, `0-9`, `_`, `.`); `phone` en E.164. El teléfono se guarda en el perfil (D-17). `409 EMAIL_TAKEN` (código nuevo) si el email ya tiene cuenta confirmada; `409 USERNAME_TAKEN`; `400` si los datos no son válidos o Supabase rechaza la contraseña; `429` con `Retry-After`; `503`. Si el email se registró y no se confirmó, responde `201` (llega el mail de nuevo) y el perfil queda como estaba.
- **Nuevo `GET /v1/auth/username-availability?username=`** → `200 { available: boolean }`, sin distinguir mayúsculas; `400`, `429`, `503`.
- **Nuevo código de error `EMAIL_TAKEN`.**
- Límite: 10 pedidos por minuto por IP en cada ruta.

## 0.10.0 — 2026-09-30 · F-06

**Aditivo.** Respuestas del onboarding (RF-048, RNF-S10, D-83). Native las empieza a mandar en F-10 (hoy se pierden).

- **Nuevo componente `OnboardingAnswers`**: `{ goals, symptoms, diets, allergies, avoid, source }`. Las cinco listas usan claves estables (no las etiquetas de la pantalla: `'Maní'` es `'peanut'`), sin repetidos; `source` es una clave o `null`. Todas las claves son obligatorias (una lista puede ir vacía).
- **Nuevo `POST /v1/users/me/onboarding`** `{ answers: OnboardingAnswers, consent?: { healthData: true, textVersion } }` → `200 { ok: true }`. Con sesión. Una fila por usuario: si se manda de nuevo, reemplaza la anterior.
- **Consentimiento:** cualquier respuesta en `symptoms`, `diets` o `allergies` (también `'none'`) necesita `consent`; sin él → `400 VALIDATION_ERROR` "Para guardar síntomas, dietas o alergias necesitamos tu consentimiento.". Si la persona no aceptó, no se manda `consent`: `healthData` tiene que ser exactamente `true` (ni `"true"` ni `1`). `textVersion` identifica el texto que aceptó (1 a 40 caracteres: letras, números, `.`, `_`, `-`).
- `400` (validación), `401`, `503`.

## 0.9.0 — 2026-09-30 · F-07

**Aditivo.** Feedback y reportes de productos, con o sin sesión (RF-043, RF-044, D-21, D-26, D-82). Native los empieza a usar en F-11b (hoy los simula).

- **Nuevo `POST /v1/feedback`** `{ message, appVersion?, platform? }` → `202 { ok: true }`. `message` de 1 a 2000 caracteres con al menos uno visible; `appVersion` hasta 32 caracteres (letras, números, `.`, `+`, `-`); `platform` `'ios' | 'android'`. `400`, `429`, `503`.
- **Nuevo `POST /v1/products/{productId}/reports`** `{ type, message? }` → `202 { ok: true }`. `type` `'info' | 'ingredients' | 'score' | 'image' | 'other'`; `message` hasta 2000 caracteres (vacío = sin mensaje). `404 NOT_FOUND` si el producto no está en el catálogo; `400`, `429`, `503`.
- Las dos rutas aceptan `Authorization: Bearer <token>` opcional: con un token válido se guarda el usuario; sin token, o con uno vencido o inválido, se guarda como anónimo (no responden `401`).
- Límite: 5 pedidos por minuto por IP en cada ruta (el general sigue en 60).

## 0.8.0 — 2026-09-30 · F-04

**Aditivo.** Recuperar la contraseña por el server (RF-025, ADR-0010, D-79): native deja de llamar a Supabase para esto en F-08.

- **Nuevo `POST /v1/auth/password/forgot`** `{ email }` → `202 { ok: true }`, exista o no el email; `400`, `429`, `503` (si Supabase Auth no responde).
- **Nuevo `POST /v1/auth/password/reset`** `{ email, code, newPassword }` → `200 { ok: true }`. `code` de 6 a 10 dígitos (el largo lo configura el proyecto de Supabase); `newPassword` de 8 a 72 caracteres. `401 INVALID_CODE` si el código no sirve o venció; `400` si Supabase rechaza la contraseña (igual a la anterior o débil), con el motivo en `error`; `429` con `Retry-After` tras 5 códigos fallidos para ese email en 15 minutos; `503`.
- **Nuevo código de error `INVALID_CODE`** (401).
- Límite de `/v1/auth/*`: 10 pedidos por minuto por IP en cada ruta (el general sigue en 60).
- Native hoy acepta contraseñas desde 6 caracteres: en F-08 pasa a 8, como el contrato.

## 0.7.0 — 2026-09-30 · F-05

**Aditivo.** Perfil del usuario (RF-028, ADR-0010): native deja de leer y escribir `profiles` directo en F-09.

- **Nuevo componente `Profile`**: `{ firstName, lastName, username, phone }`, los cuatro `string | null`.
- **Nuevo `GET /v1/users/me/profile`** → `200 Profile`; `404 NOT_FOUND` si el usuario no tiene fila; `401`, `503`.
- **Nuevo `PATCH /v1/users/me/profile`**: cambia solo los campos que vienen (al menos uno), con las reglas del registro: nombre y apellido de 1 a 60 caracteres, `username` de 3 a 30 con `^[a-z0-9_.]+$`, `phone` en E.164 (`+` y de 7 a 15 dígitos). No acepta `null` (no vacía campos) ni campos de más (D-70). → `200 Profile`; `400`, `401`, `404`, `409`, `503`.
- **Nuevo código de error `USERNAME_TAKEN`** (409): el username ya es de otro usuario (sin distinguir mayúsculas).
- Native hoy guarda el username tal como se escribe y el teléfono como texto libre: en F-09 tiene que mandar solo los campos que el usuario cambió, normalizados.

## 0.6.0 — 2026-09-29 · F-01

**Aditivo.** Nuevo `DELETE /v1/users/me/history/{productId}` (RF-017, D-13): borra el producto del historial del usuario de la sesión. Idempotente: responde `200 { ok: true }` aunque no estuviera. `400` si el id no es uuid, `401` sin sesión, `503` si la base no responde (o si Supabase Auth no responde y no hay claves para verificar la sesión, como el resto de las rutas con sesión). Native lo empieza a usar en F-11 (hoy borra solo en el teléfono y el ítem vuelve al sincronizar, RF-015).

## 0.5.0 — 2026-09-29 · H-02

**Aditivo.** `DELETE /v1/users/me` declara `503 DEPENDENCY_UNAVAILABLE` (con `Retry-After: 10`). Guardados e historial ya lo declaraban desde 0.4.0; ahora también lo responden por Auth. Decisiones: D-29, D-75.

- **El server verifica el JWT localmente** (firma con el JWKS del proyecto, `exp`, `iss`, `aud`): Supabase Auth caído ya no da `401` en las rutas con sesión. Solo si no hay claves para verificar el token responden `503`.
- `DELETE /v1/users/me` además confirma la sesión con Supabase Auth: una sesión revocada → `401`; si Auth no responde → `503` (antes `500`).
- Se exige `Authorization: Bearer <token>`: `Bearer` sin token o un header sin el prefijo → `401 "Falta el token de sesión"`. La app ya manda siempre `Bearer <token>`.
- El lookup con un token inválido o vencido sigue respondiendo como anónimo y no registra el escaneo (sin cambios para la app).
- La app ya trata cualquier error que no sea 401/404 como "reintentar", así que no necesita cambios.

## 0.4.0 — 2026-09-29 · H-01

**Aditivo.** Nuevo código de error `DEPENDENCY_UNAVAILABLE` (503, con `Retry-After: 10`): la base no respondió o falló. Lo declaran `POST /v1/products/lookup`, `GET /v1/products/{id}`, `GET`/`POST /v1/users/me/saved`, `DELETE /v1/users/me/saved/{productId}` y `GET /v1/users/me/history`.

- Antes, una caída de la base respondía `404` en el lookup y el detalle ("no está"), y `500` en guardados e historial. Ahora `404` es solo "la consulta salió bien y no hay nada".
- La app ya trata cualquier error que no sea 404 como "reintentar", así que no necesita cambios.

## 0.3.0 — 2026-09-29 · K-04

**Rompe.** Native se adapta en K-05 (tipos generados) y K-06 (pantallas); hasta entonces la integración de punta a punta no anda. Decisiones: D-32 a D-38, D-70, D-71.

**Producto: detalle y resumen.** El componente `Product` se reemplaza por dos:

- **`ProductDetail`** (12 campos): lo responden `POST /v1/products/lookup` y el nuevo `GET /v1/products/{id}`. `id`, `name`, `brand`, `imageUrl`, `score`, `scoreLabel`, `scoreColor`, `noScore`, `fito`, `highlight`, `ingredients`, `nutrition`.
- **`ProductSummary`** (7 campos, los primeros 7 del detalle): la base de cada ítem de los listados.

| Campo | Cambio |
|---|---|
| `id` | **Siempre el uuid** de `products.id` (`format: uuid`). Antes, en el lookup era la query y en los listados el uuid |
| `productId` | **Sale**: se unifica con `id` (el `productId` de `POST /v1/users/me/saved` es ese mismo `id`) |
| `highlight` | **Nuevo** (`'cuestionables' \| 'beneficiosos' \| 'ninguno'`): qué grupo de ingredientes destacar. Corta en el borde de la banda Buena: `< 50` cuestionables, `≥ 50` beneficiosos; sin puntaje, `ninguno` (D-71). Lo calcula `scoring.presentScore` (ADR-0003); reemplaza a `flagged` y al `score < 50` que calculaba native |
| `flagged` | **Sale** (cortaba en `< 40`, un corte que no era de ninguna banda: los productos de 40 a 49 no salían marcados y ahora destacan los cuestionables) |
| `brand` | `string \| null` (antes `''` cuando faltaba) |
| `subtitle`, `category`, `categoryEmoji`, `emoji`, `bgColor` | **Salen**: native no los usaba o eran constantes |
| `scoreAvailable` | **Sale**: es `score !== null` |
| `dataSource`, `aiEnriched` | **Salen** (D-33): dato interno del ETL |
| `tagline` | **Sale** (D-38): el mensaje de la banda está en `scoring-bands.json` |
| `scoreLabel` | `enum` con los labels de las bandas (sale de `scoringBands()`) |
| `fito` | `enum` `'fito' \| 'nofito' \| 'none'` (antes `string`) |
| `noScore` | `{ code, message }` con los dos campos requeridos; `code` es `enum` (`NoScoreCode`) |
| `ingredients[]` | Solo `{ name, sev, desc }`, los tres requeridos; `sev` es `enum`. Salen `position`, `impact`, `delta`, `flag`, `marker`, `percent` y `detail` |
| `nutrition` | Los 10 campos requeridos (`number \| null`), incluidos `transFat` y `cholesterol` (D-34) |

**Endpoints**

- **Nuevo `GET /v1/products/{id}`**: el detalle de un producto por su uuid (D-32). Sesión opcional; **no registra el escaneo**. `400` si el id no es uuid, `404 NOT_FOUND` ("Producto no encontrado en el catálogo") si no existe, `429`, `500`. Un error de la base responde `404` hasta H-01.
- **`GET /v1/users/me/saved`** → `{ items: SavedItem[] }`, `SavedItem = ProductSummary + savedAt` (`date-time`, ISO UTC). Antes, el producto completo sin fecha.
- **`GET /v1/users/me/history`** → `{ items: HistoryItem[] }`, `HistoryItem = ProductSummary + scannedAt` (`date-time`, ISO UTC). Antes, el producto completo sin fecha.
- **Nombre de reemplazo** cuando el producto no trae nombre: en el lookup, la query (como antes); en los listados y en `GET /v1/products/{id}`, el **barcode** de la fila (antes los listados mostraban el uuid).

**Campos de más → 400 (D-70).** El body de `POST /v1/products/lookup`, el de `POST /v1/users/me/saved` y el querystring de `GET /v1/users/me/history` declaran `additionalProperties: false` y el server valida con `removeAdditional: false`: un campo que no está en el contrato responde `400 VALIDATION_ERROR` (antes se borraba en silencio). En el OpenAPI se ve en los dos bodies; el del querystring no tiene dónde verse (OpenAPI describe cada parámetro por separado), pero rige igual.

**Sin cambios:** los errores (`ApiError`), `Ok`, `DELETE /v1/users/me/saved/{productId}`, `DELETE /v1/users/me` y `scoring-bands.json`.

## 0.2.0 — 2026-09-29 · K-03

**Rompe** (se coordina con native en el mismo release: D-57, sin alias). Native lo acompaña en la rama `feat/k03-v1`.

- **Prefijo `/v1`** en todas las rutas (D-44): `POST /v1/products/lookup`, `GET`/`POST /v1/users/me/saved`, `DELETE /v1/users/me/saved/{productId}`, `GET /v1/users/me/history`, `DELETE /v1/users/me`. Las rutas sin `/v1` responden `404 NOT_FOUND`. `/health` sigue afuera.
- **Formato único de errores** `ApiError` = `{ error, code }` (03-contratos §B.2). `code` es un enum con los códigos que el server responde hoy (D-69); los demás se suman con el ítem que los empieza a usar:

| `code` | Status | Cuándo |
|---|---|---|
| `VALIDATION_ERROR` | 400 (o el 4xx de Fastify: 413, 415…) | Body, params o querystring inválidos, JSON roto. Mensaje fijo en español; el detalle de ajv va al log |
| `UNAUTHENTICATED` | 401 | Sin token o sesión inválida |
| `NOT_FOUND` | 404 | Guardar un producto que no existe; ruta inexistente |
| `PRODUCT_NOT_IN_CATALOG` | 404 | Lookup sin producto |
| `RATE_LIMITED` | 429 (+ `Retry-After`) | Rate limit global (60/min por IP). **Antes respondía 500** (caracterizado en M-02) |
| `INTERNAL` | 500 | Error del handler o excepción no atrapada; ya no se devuelve el mensaje interno |

- Se elimina el componente `InternalError` (el 500 tenía dos formas: `{ error }` o el genérico de Fastify `{ statusCode, error, message }`); todos los errores son `ApiError`.
- Cada ruta declara sus errores: `400` si recibe datos, `401` si pide sesión, `404` si aplica, y `429` y `500` en todas.
- Sin cambios en los `200` ni en `Product`.

## Bandas del puntaje — 2026-09-29 · K-08

Primera versión de `contract/scoring-bands.json` (aditivo: el OpenAPI no cambia). Sale de `scoring.scoringBands()`, armado con `TIERS` y `NO_DATA_TIER`; el label, el mensaje y el sello de cada banda son los que devuelven `getScoreLabel`, `getScoreTagline` y `getSello`, y un test verifica cada puntaje de 0 a 100.

| Banda | Desde | Hasta | Color | Mensaje | Sello |
|---|---|---|---|---|---|
| Excelente | 75 | 100 | `#16a34a` | Lo recomendamos | FITOGÉNICO |
| Bueno | 50 | 74 | `#84cc16` | Buena opción | — |
| Moderado | 25 | 49 | `#f97316` | Consumilo con consciencia | — |
| Malo | 0 | 24 | `#dc2626` | No lo recomendamos | NO FITOGÉNICO |
| Sin datos suficientes | — | — | `#9ca3af` | No tenemos datos confiables de este producto | — |

Native lo consume generado en K-09 (sin tablas de cortes escritas a mano).

## 0.1.0 — 2026-09-29 · K-01

Primera versión generada. **Describe el contrato tal como estaba** (sin `/v1`, errores `{ error }`); no cambia ninguna respuesta.

- Endpoints: `POST /products/lookup`, `GET`/`POST /users/me/saved`, `DELETE /users/me/saved/{productId}`, `GET /users/me/history`, `DELETE /users/me`. `/health` queda afuera (D-44).
- Componentes: `Product` (el mismo JSON Schema que se escribía a mano en `lookupSchema.ts`), `ApiError` (`{ error }`), `InternalError` (el 500 con sus dos formas de hoy: `{ error }` del handler o el genérico de Fastify) y `Ok` (`{ ok: true }`).
- Las rutas de user-library y account no tenían schema de respuesta: ahora lo tienen, con exactamente lo que ya respondían (verificado con los 200 productos de la muestra del catálogo).
- Sin declarar todavía: el 400 de validación y el 429 del rate limit (K-03, formato único de errores).
