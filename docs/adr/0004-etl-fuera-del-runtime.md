# ADR-0004 · El ETL fuera del runtime, con config propia

- **Estado:** Propuesto
- **Fecha:** 2026-09-28
- **Relacionado:** [02-arquitectura.md §2.2 y §5.4](../02-arquitectura.md), D-05, D-19

## Contexto

- El ETL (`scripts/etl/**`, 11 jobs) corre a mano con `tsx`, no se compila con el server (`tsconfig` solo incluye `src/`).
- Pero **usa código de `src/services/`** (`cacheService.buildCachePayload`, `productLookupService.mapRawToProduct`, `claudeService.enrichWithAI`) y **la config del server** (`scripts/etl/lib/supabaseAdmin.ts` y `qualityAI.ts` importan `src/config.ts`).
- Consecuencias actuales:
  - El server exige `ANTHROPIC_API_KEY` y `SERPAPI_API_KEY` para arrancar sin usarlas: el ETL las necesita y comparten `config.ts`.
  - `@anthropic-ai/sdk` es dependencia de producción del server sin que el runtime la use (`knip --production`).
  - Código que solo usa el ETL vive en `src/services/` (`claudeService.ts`) y en `src/domain/` (`nutrientPlausibility.ts`).
- El saneamiento de datos es una prioridad antes de medir el 95% (D-19): el ETL va a crecer.

## Decisión

1. El ETL se muda a **`etl/`** en la raíz del repo (el módulo *ingestion*): sigue en el mismo repo y el mismo `package.json`, pero **fuera del build y del deploy** del server.
2. **Config propia** (`etl/config.ts`) con sus variables (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `ANTHROPIC_API_KEY`). El server deja de exigirlas (D-05).
3. El ETL importa **solo** las APIs públicas de `catalog` (tipo `RawProduct`, `createProductWriter()`) y de `scoring`. Escribe en `products` a través del escritor del catálogo, que es el dueño de la tabla (ADR-0005). Es dueño de `products_staging`.
4. Lo que solo usa el ETL se muda con él: `claudeService.ts` → `etl/enrichment/`, `nutrientPlausibility.ts` → `etl/quality/`.
5. `@anthropic-ai/sdk` pasa a `devDependencies` (el ETL corre con `tsx` en la máquina del operador).
6. Nada de `src/` importa `etl/` (regla `src-no-importa-etl-ni-scripts`).

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| Repo aparte para el ETL | Duplicaría tipos y el motor, o obligaría a publicar paquetes. Hoy es un solo equipo con un solo ciclo de cambios |
| `src/modules/ingestion/` dentro del build | Metería al deploy código y dependencias que el server no usa, y reabriría el problema de la config compartida |
| Workspace npm separado (`packages/etl`) | Correcto a futuro, pero agrega configuración ahora. Se puede hacer después sin cambiar las fronteras |

## Consecuencias

- **+** El server arranca solo con lo que usa; se achican las dependencias de producción.
- **+** El ETL puede cambiar su forma de escribir sin tocar el runtime, siempre que respete el escritor del catálogo.
- **−** Los jobs cambian de ruta (`npm run etl:*` se actualiza en el mismo PR) y la documentación del ETL también.
- **Justificación:** SRP (runtime vs. batch), ISP (el server solo ve el puerto de lectura del catálogo), KISS (mismo repo y mismo `package.json`).
