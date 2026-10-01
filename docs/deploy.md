# Deploy y rollback del server

R-06 · [ADR-0007](adr/0007-portabilidad-de-hosting.md) · [ADR-0009](adr/0009-migraciones.md) · D-59 · D-91. Native no se deploya desde acá: sale por las tiendas.

## Cómo queda

| Qué | Cómo |
|---|---|
| Rama de producción | `main` (protegida: merge solo con CI verde) |
| Build | El `Dockerfile` del repo: la misma imagen que construye y prueba el CI (job `docker`) |
| Cuándo deploya | Render, automático **después de que el CI pase** en `main` |
| Salud | Render mira `/health` (el proceso responde). `/health/ready` (Supabase) es para mirar a mano: si Render lo usara, una caída de Supabase reiniciaría el server sin motivo |
| Apagado | SIGTERM → termina los requests en curso y sale (R-03) |
| Versiones | Tag `vX.Y.Z` en `main` después de verificar cada deploy |

## Configuración de Render (la hace el responsable, una sola vez)

En el servicio del server, después del primer merge del refactor a `main` (el `main` viejo no tiene `Dockerfile`):

| Dónde | Valor |
|---|---|
| Settings → Build & Deploy → **Runtime / Language** | `Docker` |
| Dockerfile Path / Docker Build Context | `./Dockerfile` / `.` (borrar el build y start command de Node) |
| Settings → Build & Deploy → **Auto-Deploy** | `After CI Checks Pass` (si el plan no lo ofrece: `Off` y deploy manual después del CI verde) |
| Settings → **Health Check Path** | `/health` |
| Environment | `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `TRUST_PROXY=10.0.0.0/8`, `LOG_LEVEL=info`. `CORS_ORIGINS` vacía. Sin `ANTHROPIC_API_KEY` (solo el ETL la usa). `PORT` la pone Render |

## Protección de `main` (GitHub, una sola vez, en los dos repos)

Settings → Branches → Add rule para `main`: *Require a pull request before merging*, *Require status checks to pass* (server: `test`, `docker`, `migraciones`; native: `test`) y sin *force push*.

## Pasar el refactor a `main` (D-59)

1. PR `fitogenix/refactor-cleanup` → `main` en el server, con el CI verde; merge.
2. Configurar Render (tabla de arriba) y deployar.
3. Verificar: `/health` 200, `/health/ready` 200, un lookup por barcode y uno por nombre, y en el log `incoming request` que `remoteAddress` sea la IP del cliente (no `10.x`).
4. Tag: `git tag -a v1.0.0 -m "Refactor completo" && git push origin v1.0.0`.
5. Lo mismo en native (PR y merge; sin deploy). Dependabot se activa en los dos repos con este merge.

## Rollback

| Qué falló | Qué hacer |
|---|---|
| El deploy no arranca | Render no cambia el tráfico si `/health` no responde: queda el deploy anterior. Revisar los logs del deploy |
| El deploy arrancó pero algo anda mal | Render → *Events* → el deploy anterior → **Rollback** (vuelve a esa imagen en segundos). Después, `git revert` del merge en `main` para que el próximo deploy no lo repita |
| Una migración | Las migraciones solo van hacia adelante: se escribe una nueva que deshace (cada una tiene su SQL de vuelta en `docs/sql/`, p. ej. [`b03-rollback.sql`](sql/b03-rollback.sql)) y se aplica con `supabase db push` |

**Orden para cambios de base (expand/contract):** primero se deploya código que funciona con el esquema viejo y con el nuevo, después se aplica la migración, y recién en otro deploy se saca lo viejo. Así un rollback de código nunca queda contra una base que no entiende (así se hizo B-01: el código dejó de usar las columnas antes del `DROP`).
