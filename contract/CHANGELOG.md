# Changelog del contrato HTTP

El contrato son dos archivos generados con `npm run contract:generate` ([ADR-0011](../docs/adr/0011-contrato-http-fuente-unica.md)): `contract/openapi.json`, desde los schemas TypeBox de las rutas, y `contract/scoring-bands.json`, las bandas del puntaje desde el motor (D-63). El CI falla si alguno de los archivos commiteados no coincide con lo que se genera (`npm run contract:check`). Todo cambio del archivo se anota acá, con el ítem del plan que lo hizo.

Reglas ([03-contratos.md §B.5](../docs/03-contratos.md)): los cambios aditivos son libres; los que rompen se coordinan con un release de native.

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
