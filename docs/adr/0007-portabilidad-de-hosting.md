# ADR-0007 · Portabilidad de hosting

- **Estado:** Propuesto. Hecho: `engines.node` + `.nvmrc` y el `Dockerfile` multi-stage, construido y probado en el CI (H-05)
- **Fecha:** 2026-09-28
- **Relacionado:** D-11, D-18, RNF-P05, [00-inventario.md §2.2](../00-inventario.md)

## Contexto

- El server corre en Render **plan free** y es posible cambiar de proveedor (D-11). Antes de publicar en las tiendas, debe correr en una instancia siempre encendida (D-18).
- La config de deploy vive **solo en el dashboard de Render** (build `npm install && npm run build`, start `node dist/main.js`); nada está versionado en el repo.
- La versión de Node **no está fijada** (sin `engines.node` ni `.nvmrc`): Render usa su default, que puede cambiar sin aviso.
- El hook `prestart` de `package.json` no corre en Render (el start no pasa por `npm start`).
- El rate limit (`@fastify/rate-limit`) y el singleflight (`withSingleflight`) viven en memoria del proceso.

## Decisión

1. **El repo describe cómo correr el server**, sin depender del proveedor:
   - `engines.node` en `package.json` + `.nvmrc` con la misma versión (hoy local: 22.x).
   - Scripts estándar: `build` (`tsc`), `start` (`node dist/main.js`) y sin `prestart` (el build es un paso aparte).
   - `Dockerfile` multi-stage (build → runtime con solo dependencias de producción) como **forma portable de referencia**: cualquier proveedor (Render, Fly.io, Railway, Cloud Run) lo puede correr igual.
2. **Config solo por variables de entorno**, validadas al arrancar (`platform/config.ts`); `PORT` y `HOST` de env. Nada específico del proveedor en el código.
3. **Sin estado local crítico:** el rate limit y el singleflight en memoria son aceptables **mientras haya una sola instancia**. Al pasar a más de una, el rate limit usa Redis como store (`@fastify/rate-limit` lo soporta) y el singleflight queda como optimización por instancia.
4. **Health estándar** (`/health`, `/health/ready`, ADR-0006) para que cualquier plataforma pueda hacer health checks.
5. **Criterio para elegir proveedor antes de publicar** (no se elige ahora): instancia siempre encendida, deploy desde el repo o Dockerfile, logs con retención suficiente para medir el p95, región cercana a la de Supabase.

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| Versionar `render.yaml` (Blueprint) | Ata el repo a Render; el Dockerfile sirve para Render y para cualquier otro |
| Serverless (Lambda, Vercel Functions) | Cambia el modelo (arranques en frío por función, conexiones a la base) justo cuando se busca eliminar el arranque en frío |
| No hacer nada hasta migrar | La versión de Node y la config sin versionar son un riesgo hoy, en Render mismo |

## Consecuencias

- **+** Migrar de proveedor se reduce a configurar variables de entorno y apuntar al Dockerfile.
- **+** El build es reproducible localmente y en CI.
- **−** El Dockerfile hay que mantenerlo (mínimo: dos etapas, pocas líneas).
- **−** Mientras siga en plan free, el arranque en frío existe: el p95 se informa excluyéndolo (D-18).
