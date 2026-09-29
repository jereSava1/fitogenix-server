# Changelog del contrato HTTP

El contrato son dos archivos generados con `npm run contract:generate` ([ADR-0011](../docs/adr/0011-contrato-http-fuente-unica.md)): `contract/openapi.json`, desde los schemas TypeBox de las rutas, y `contract/scoring-bands.json`, las bandas del puntaje desde el motor (D-63). El CI falla si alguno de los archivos commiteados no coincide con lo que se genera (`npm run contract:check`). Todo cambio del archivo se anota acá, con el ítem del plan que lo hizo.

Reglas ([03-contratos.md §B.5](../docs/03-contratos.md)): los cambios aditivos son libres; los que rompen se coordinan con un release de native.

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
