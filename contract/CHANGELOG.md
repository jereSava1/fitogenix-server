# Changelog del contrato HTTP

El contrato son dos archivos generados con `npm run contract:generate` ([ADR-0011](../docs/adr/0011-contrato-http-fuente-unica.md)): `contract/openapi.json`, desde los schemas TypeBox de las rutas, y `contract/scoring-bands.json`, las bandas del puntaje desde el motor (D-63). El CI falla si alguno de los archivos commiteados no coincide con lo que se genera (`npm run contract:check`). Todo cambio del archivo se anota acá, con el ítem del plan que lo hizo.

Reglas ([03-contratos.md §B.5](../docs/03-contratos.md)): los cambios aditivos son libres; los que rompen se coordinan con un release de native.

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
