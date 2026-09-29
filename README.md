# fitogenix-server

Backend de Fitogenix (Fastify + TypeScript). Resuelve productos por barcode o por nombre **contra el catálogo propio** (Supabase, con Redis adelante), calcula el puntaje con el motor de `src/modules/scoring/` (API pública en su `index.ts`) y guarda los guardados y el historial de cada usuario. El catálogo lo puebla el ETL de `etl/`, fuera del server.

La documentación completa (auditoría, requisitos, arquitectura objetivo, contratos, decisiones y plan de limpieza) está en [`docs/`](docs/README.md). Este README es el cómo correrlo.

## Primeros pasos

Node 22 (`.nvmrc`).

```bash
npm install
cp .env.example .env    # completar (ver abajo)
npm run dev             # tsx watch src/main.ts, puerto 3000
```

### Variables (`.env`)

| Variable | Requerida | Para qué |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | sí | Catálogo, guardados, historial y validación de sesión. Es la secret key (`sb_secret_…`), que opera como `service_role` |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | no | Cache caliente de productos. Sin ellas, el server anda sin Redis |
| `PORT` | no | Por defecto 3000 |
| `ANTHROPIC_API_KEY` | solo ETL | Enriquecimiento con IA del ETL. El server no la usa |

## Antes de dar algo por terminado

```bash
npm run typecheck    # tsc de src/, etl/ y scripts/ (tsconfig.scripts.json)
npm run lint:deps    # reglas de dependencias entre módulos (dependency-cruiser); cualquier violación falla
npm run lint:unused  # código, exports y dependencias sin uso (knip --production, config en knip.json)
npm run contract:check  # contract/openapi.json al día con los schemas (si falla: npm run contract:generate)
npm test             # vitest
```

El CI (`.github/workflows/ci.yml`) corre lo mismo en cada push y PR. Los tests viven al lado del código (`*.test.ts`). Los de caracterización del motor, de auth y de las rutas (etapa 1 del plan) fijan el comportamiento actual: si un cambio los rompe a propósito, se actualizan en el mismo PR con el motivo.

## Rutas

| Ruta | Auth | Qué hace |
|---|---|---|
| `POST /products/lookup` `{ query }` | opcional | Busca por barcode (8 a 14 dígitos) o por nombre. Con sesión, registra el escaneo en el historial. `404` si no está en el catálogo |
| `GET /users/me/saved` | sí | Guardados del usuario |
| `POST /users/me/saved` `{ productId }` | sí | Guardar (idempotente). `404` si el producto no existe |
| `DELETE /users/me/saved/:productId` | sí | Quitar un guardado (idempotente) |
| `GET /users/me/history?limit=` | sí | Historial de escaneos (`limit` entre 1 y 50, por defecto 20) |
| `DELETE /users/me` | sí | Eliminar la cuenta |
| `GET /health` | no | Chequeo de vida |

La sesión es el JWT de Supabase Auth en `Authorization: Bearer …`. El contrato de estas rutas (request, respuestas y errores) está en [`contract/openapi.json`](contract/openapi.json), generado desde los schemas TypeBox de cada módulo; sus cambios, en [`contract/CHANGELOG.md`](contract/CHANGELOG.md). El contrato objetivo (prefijo `/v1`, errores uniformes, endpoints nuevos) está en [`docs/03-contratos.md`](docs/03-contratos.md).

## Cómo resuelve un producto

`POST /products/lookup` → `src/modules/catalog/` (caso de uso `application/lookupProduct.ts`), de **solo lectura**: Redis → Supabase. Si no está en el catálogo, responde `404`; no hay fallback a proveedores externos ni a IA durante la request.

- En Supabase se guardan los **datos crudos** (`ingredients_text`, `nutriments`, `additives_tags`…) y el puntaje se **recalcula al leer**, así un cambio del motor no deja puntajes viejos. Una fila sin ingredientes ni nutrientes cuenta como "no está en el catálogo".
- La identidad del producto es `products.id` (uuid), que viaja como `productId` y es lo que referencian guardados e historial.
- Hoy una caída de Supabase también responde `404` y Redis no tiene timeout: está caracterizado en los tests y se corrige en H-01 (ver `docs/05-plan.md`).

Cada lookup deja una línea de log:

```json
{"event":"product_lookup","cacheKey":"7622210449283","source":"supabase","dataSource":"off"}
```

`source` es el nivel que respondió (`redis`, `supabase` por barcode, `catalog` por nombre) y `dataSource`, la fuente original del dato.

## Base de datos

`supabase/migrations/legacy/` tiene las migraciones históricas `001` a `015`, que se aplicaron a mano en el SQL Editor y **no reproducen** la base real (hay objetos creados a mano). La baseline con la CLI de Supabase (`supabase/migrations/<timestamp>_baseline.sql`) es el ítem C-05 del plan. Las consultas y migraciones las corre el responsable del proyecto (D-58); los scripts entregados quedan en [`docs/sql/`](docs/sql/).

## ETL

El ETL (`etl/`, scripts `etl:*` de `package.json`, con su propia config en `etl/config.ts`) ingesta Open Food Facts y supermercados VTEX a `products_staging`, mergea al catálogo y opcionalmente enriquece con IA. No es parte del build del server. Cómo correrlo: [`etl/README.md`](etl/README.md).

## Deploy

Render (plan free), desde `main`: build `npm install && npm run build`, start `node dist/main.js`. La configuración vive en el dashboard de Render.

## Ramas

Una rama por tarea. Durante el refactor todo se integra en `fitogenix/refactor-cleanup` y recién al final pasa a `main` (D-59).
