# Changelog del contrato HTTP

El contrato es `contract/openapi.json`, generado desde los schemas TypeBox de las rutas (`npm run contract:generate`, [ADR-0011](../docs/adr/0011-contrato-http-fuente-unica.md)). El CI falla si el archivo commiteado no coincide con los schemas (`npm run contract:check`). Todo cambio del archivo se anota acá, con el ítem del plan que lo hizo.

Reglas ([03-contratos.md §B.5](../docs/03-contratos.md)): los cambios aditivos son libres; los que rompen se coordinan con un release de native.

## 0.1.0 — 2026-09-29 · K-01

Primera versión generada. **Describe el contrato tal como estaba** (sin `/v1`, errores `{ error }`); no cambia ninguna respuesta.

- Endpoints: `POST /products/lookup`, `GET`/`POST /users/me/saved`, `DELETE /users/me/saved/{productId}`, `GET /users/me/history`, `DELETE /users/me`. `/health` queda afuera (D-44).
- Componentes: `Product` (el mismo JSON Schema que se escribía a mano en `lookupSchema.ts`), `ApiError` (`{ error }`), `InternalError` (el 500 con sus dos formas de hoy: `{ error }` del handler o el genérico de Fastify) y `Ok` (`{ ok: true }`).
- Las rutas de user-library y account no tenían schema de respuesta: ahora lo tienen, con exactamente lo que ya respondían (verificado con los 200 productos de la muestra del catálogo).
- Sin declarar todavía: el 400 de validación y el 429 del rate limit (K-03, formato único de errores).
