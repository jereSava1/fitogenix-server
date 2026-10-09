# Deploy y rollback

La app no se deploya desde acá: sale por las tiendas.

## Cómo queda

| Qué | Cómo |
|---|---|
| Rama de producción | `main` |
| Hosting | Render, plan free. Build `npm install && npm run build`, start `node dist/main.js` (D-93: Render no deja pasar a Docker un servicio existente) |
| Docker | El `Dockerfile` se usa en local y en el CI (job `docker`), y sirve para mover el server a cualquier proveedor ([ADR-0007](adr/0007-portabilidad-de-hosting.md)) |
| Imagen base | El `Dockerfile` toma `node:22-alpine` de `public.ecr.aws/docker/library` (espejo oficial de Docker Hub, misma imagen y variante) desde 2026-10-09, porque Docker Hub devolvía 429 (límite de descargas anónimas) a los runners del CI. Para volver atrás: cambiar los dos `FROM` a `node:22-alpine`. Render no usa el `Dockerfile` (D-93) |
| Cuándo deploya | Automático después de que pase el CI en `main` (Auto-Deploy: *After CI Checks Pass*) |
| Salud | Health Check Path: `/health`. `/health/ready` es para mirar a mano: si Render lo usara, una caída de Supabase reiniciaría el server sin motivo |
| Apagado | Con SIGTERM termina los requests en curso y sale |
| Versiones | Tag `vX.Y.Z` en `main` después de verificar el deploy |

## Variables en Render

`SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `TRUST_PROXY=10.0.0.0/8` y `LOG_LEVEL=info`.

- `CORS_ORIGINS` va vacía.
- `PORT` la pone Render.
- El server no usa claves de IA ni de otros proveedores.

## Verificar un deploy

1. `/health` y `/health/ready` responden 200. En el plan free, el primer pedido tarda mientras la instancia despierta.
2. Funcionan un lookup por código y uno por nombre.
3. En el log `incoming request`, `remoteAddress` es la IP del cliente y no una `10.x`.

## Rollback

| Qué falló | Qué hacer |
|---|---|
| El deploy no arranca | Render no cambia el tráfico si `/health` no responde, así que queda el deploy anterior. Revisar los logs |
| El deploy arrancó pero algo anda mal | Render → *Events* → deploy anterior → **Rollback**. Después, `git revert` del merge en `main` para que el próximo deploy no lo repita |
| Una migración | Las migraciones solo van hacia adelante: se escribe una nueva que deshace el cambio y se aplica con `supabase db push` (ejemplo: [`sql/b03-rollback.sql`](sql/b03-rollback.sql)) |

**Cambios de base (expand/contract):**
1. Se deploya código que funciona con el esquema viejo y con el nuevo.
2. Se aplica la migración.
3. En otro deploy se saca lo viejo.

Así, un rollback de código nunca queda corriendo contra una base que no entiende.
