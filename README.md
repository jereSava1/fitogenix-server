# fitogenix-server

Backend de Fitogenix (Fastify + TypeScript). Busca productos por código de barras o por nombre en el catálogo propio (Supabase, con Redis adelante), calcula su puntaje y maneja las cuentas, los guardados y el historial de cada usuario. El catálogo lo carga el ETL de `etl/`, fuera del server.

Requerimientos, arquitectura y decisiones: [`docs/`](docs/README.md). Este README es el cómo correrlo.

## Primeros pasos

Node 22 (`.nvmrc`).

```bash
npm install
cp .env.example .env    # completar (ver abajo)
npm run dev             # tsx watch src/main.ts, puerto 3000
```

Con Docker (la misma imagen que prueba el CI):

```bash
docker build -t fitogenix-server .
docker run -p 3000:3000 --env-file .env fitogenix-server
```

Dentro del contenedor, `127.0.0.1` es el contenedor mismo: para usar el Supabase local (`supabase start`), poné `SUPABASE_URL=http://host.docker.internal:54321`.

### Variables (`.env`)

| Variable | Requerida | Para qué |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | sí | Base y Auth. La secret key (`sb_secret_…`) opera como `service_role` |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | no | Cache de productos. Sin ellas, el server anda sin Redis |
| `PORT` | no | Por defecto 3000 |
| `CORS_ORIGINS` | no | Orígenes web con CORS, separados por coma. Vacía = sin CORS (la app nativa no lo usa) |
| `TRUST_PROXY` | en deploy | Proxies de confianza (IPs, CIDR o nombres de `proxy-addr`). En Render, `10.0.0.0/8`. Sin esto, el rate limit ve la IP del balanceador. Verificación: en el log `incoming request`, `remoteAddress` es la IP del cliente |
| `LOG_LEVEL` | no | `info` por defecto |
| `ANTHROPIC_API_KEY` | solo ETL | El server no la usa |

## Antes de dar algo por terminado

```bash
npm run typecheck       # src/, etl/ y scripts/
npm run lint:deps       # reglas de dependencias entre módulos
npm run lint:unused     # código y dependencias sin uso (knip)
npm run contract:check  # contract/ al día (si falla: npm run contract:generate)
npm test
```

El CI (`.github/workflows/ci.yml`) corre lo mismo, construye la imagen Docker y aplica las migraciones sobre una base limpia. La lista completa está en [`docs/README.md`](docs/README.md#definition-of-done).

## API

Todas las rutas cuelgan de `/v1`. El contrato (requests, respuestas y errores) está en [`contract/openapi.json`](contract/openapi.json), generado desde los schemas de cada módulo. Sus cambios están en [`contract/CHANGELOG.md`](contract/CHANGELOG.md).

- **Fuera del contrato:** `GET /health` (el proceso responde) y `GET /health/ready` (responde Supabase).
- **Sesión:** `Authorization: Bearer <token>`, con el token que entrega `/v1/auth/*`.

Cada lookup deja una línea de log con el nivel que respondió (`redis`, `supabase` por código o `catalog` por nombre) y la fuente original del dato:

```json
{"event":"product_lookup","cacheKey":"7622210449283","source":"supabase","dataSource":"off"}
```

## Base de datos

La base cambia solo con migraciones de `supabase/migrations/`, aplicadas con `supabase db push` ([ADR-0009](docs/adr/0009-migraciones.md)). Nunca se pega SQL en el editor web. `supabase/migrations/legacy/` es historia: no reproduce la base.

Después de una migración, regenerar los tipos con `npm run db:types` (necesita `supabase start`).

## ETL

`npm run etl:*`, con su propia config (`etl/config.ts`). Cómo correrlo: [`etl/README.md`](etl/README.md).

## Deploy

Render deploya `main` con el build de Node. Configuración y rollback: [`docs/deploy.md`](docs/deploy.md).

## Ramas

Una rama por tarea y PR a `main`, que se mergea con el CI verde.
