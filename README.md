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
| `CORS_ORIGINS` | no | Orígenes web con CORS, separados por coma. Vacía = sin CORS (la app nativa no lo usa) |
| `TRUST_PROXY_HOPS` | en deploy | Proxies delante del server. Sin esto, detrás del balanceador de Render el rate limit por IP ve la del proxy y todos comparten el límite |
| `ANTHROPIC_API_KEY` | solo ETL | Enriquecimiento con IA del ETL. El server no la usa |

## Antes de dar algo por terminado

```bash
npm run typecheck    # tsc de src/, etl/ y scripts/ (tsconfig.scripts.json)
npm run lint:deps    # reglas de dependencias entre módulos (dependency-cruiser); cualquier violación falla
npm run lint:unused  # código, exports y dependencias sin uso (knip --production, config en knip.json)
npm run contract:check  # contract/ (OpenAPI y bandas) al día con los schemas y el motor (si falla: npm run contract:generate)
npm test             # vitest
```

El CI (`.github/workflows/ci.yml`) corre lo mismo en cada push y PR. Los tests viven al lado del código (`*.test.ts`). Los de caracterización del motor, de auth y de las rutas (etapa 1 del plan) fijan el comportamiento actual: si un cambio los rompe a propósito, se actualizan en el mismo PR con el motivo.

## Rutas

Todas las rutas del contrato llevan el prefijo **`/v1`** (D-44), sin alias de las rutas viejas (D-57). `/health` queda afuera: no es parte del contrato con la app.

| Ruta | Auth | Qué hace |
|---|---|---|
| `POST /v1/products/lookup` `{ query }` | opcional | Busca por barcode (8 a 14 dígitos) o por nombre y responde el detalle (`ProductDetail`). Con sesión, registra el escaneo en el historial. `404 PRODUCT_NOT_IN_CATALOG` si no está en el catálogo |
| `GET /v1/products/:id` | opcional | Detalle de un producto por su uuid (lo que abre la app desde un guardado o el historial). No registra el escaneo. `404 NOT_FOUND` si no existe |
| `GET /v1/users/me/saved` | sí | Guardados del usuario: resumen del producto (`ProductSummary`) más `savedAt` |
| `POST /v1/users/me/saved` `{ productId }` | sí | Guardar (idempotente). `404 NOT_FOUND` si el producto no existe |
| `DELETE /v1/users/me/saved/:productId` | sí | Quitar un guardado (idempotente) |
| `GET /v1/users/me/history?limit=` | sí | Historial de escaneos: resumen más `scannedAt` (`limit` entre 1 y 50, por defecto 20) |
| `DELETE /v1/users/me` | sí | Eliminar la cuenta |
| `GET /health` | no | Chequeo de vida (el proceso responde) |
| `GET /health/ready` | no | Listo para atender: 503 si Supabase no responde; informa el estado de Redis |

Todos los errores tienen la misma forma, `{ error, code }`: `error` es el mensaje para mostrar, en español, y `code` es estable para que la app decida qué hacer (`VALIDATION_ERROR` 400, `UNAUTHENTICATED` 401, `NOT_FOUND` / `PRODUCT_NOT_IN_CATALOG` 404, `RATE_LIMITED` 429, `INTERNAL` 500, `DEPENDENCY_UNAVAILABLE` 503 con `Retry-After` si la base o Supabase Auth no responden). Lo que no responde un handler (validación, rate limit, ruta inexistente, excepciones) lo arma `src/platform/http/errors.ts`; el detalle técnico va solo al log. Un campo de más en un body o en el querystring del historial es un `400 VALIDATION_ERROR`: no se ignora en silencio (D-70).

La sesión es el JWT de Supabase Auth en `Authorization: Bearer <token>` (sin el prefijo `Bearer`, 401). El server lo verifica localmente con las claves públicas del proyecto (JWKS de `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`, en memoria): firma, vencimiento, emisor y audiencia, sin consultar a Supabase en cada request. Si Supabase Auth no responde se siguen usando las últimas claves; sin ninguna, las rutas con sesión responden `503`. `DELETE /v1/users/me` además confirma la sesión con Supabase Auth, así una sesión revocada no puede borrar la cuenta (ADR-0008). El contrato de estas rutas (request, respuestas y errores) está en [`contract/openapi.json`](contract/openapi.json), generado desde los schemas TypeBox de cada módulo, y las bandas del puntaje (cortes, colores, mensajes y sellos) en [`contract/scoring-bands.json`](contract/scoring-bands.json), generado desde el motor; sus cambios, en [`contract/CHANGELOG.md`](contract/CHANGELOG.md). El contrato objetivo (endpoints que faltan: auth, perfil, feedback) está en [`docs/03-contratos.md`](docs/03-contratos.md).

## Cómo resuelve un producto

`POST /v1/products/lookup` → `src/modules/catalog/` (caso de uso `application/lookupProduct.ts`), de **solo lectura**: Redis → Supabase. Redis guarda los datos crudos del producto y la respuesta se arma en cada lectura, así que un cambio del motor o del contrato no deja entradas viejas que invalidar. Si no está en el catálogo, responde `404`; no hay fallback a proveedores externos ni a IA durante la request.

- En Supabase se guardan los **datos crudos** (`ingredients_text`, `nutriments`, `additives_tags`…) y el puntaje se **recalcula al leer**, así un cambio del motor no deja puntajes viejos. Una fila sin ingredientes ni nutrientes cuenta como "no está en el catálogo".
- La identidad del producto es `products.id` (uuid), que viaja como `id` en el detalle y en los listados, y es lo que referencian guardados e historial (el `productId` de `POST /v1/users/me/saved`).
- Una caída de Supabase responde `503` (nunca "no está"), con 2 s de tope por consulta; Redis tiene 200 ms y, si no responde, se sigue sin él.

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

Render (plan free), desde `main`: build `npm install && npm run build`, start `node dist/main.js`. La configuración vive en el dashboard de Render: ahí hay que definir `TRUST_PROXY_HOPS` (ver Variables).

Forma portable ([ADR-0007](docs/adr/0007-portabilidad-de-hosting.md)): el `Dockerfile` construye una imagen con solo dependencias de producción, configurable por variables de entorno (las de `.env.example`). El CI la construye, la levanta y le pide `/health`.

```bash
docker build -t fitogenix-server .
docker run -p 3000:3000 --env-file .env fitogenix-server
```

## Ramas

Una rama por tarea. Durante el refactor todo se integra en `fitogenix/refactor-cleanup` y recién al final pasa a `main` (D-59).
