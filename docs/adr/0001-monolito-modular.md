# ADR-0001 · Monolito modular con módulos por capacidad

- **Estado:** Propuesto
- **Fecha:** 2026-09-28
- **Relacionado:** [02-arquitectura.md §2](../02-arquitectura.md), ADR-0002, ADR-0004

## Contexto

- El server es un solo proceso Fastify (~9.300 líneas en `src/`, la mitad tests) con 8 rutas, deployado en Render plan free, con **una instancia** (D-11).
- El código está organizado por **tipo técnico** (`routes/`, `services/`, `domain/`, `types/`): `src/services/` mezcla el lookup, el historial, los guardados, la cache, servicios que solo usa el ETL (`claudeService.ts`) y código muerto (`offService.ts`, `fallbackFoodApi.ts`, `openBeautyFactsApi.ts`).
- Ya hay acoplamientos cruzados que dificultan cambiar una cosa sin tocar otra: la ruta del lookup importa el servicio de historial (`routes/products/lookup.ts` → `scanHistoryService`), y `productRowMapper.ts` existe solo para esquivar un ciclo entre `cacheService` y `productLookupService`.
- Se vienen funcionalidades nuevas: feedback, reportes, onboarding, borrar historial, y después alternativas, lectura de etiquetas y metales pesados en el motor (D-24, D-25).

## Decisión

Un **monolito modular**: un solo deploy, con código organizado en módulos por **capacidad de negocio** bajo `src/modules/`:

- `scoring`: el motor, dominio puro (ADR-0003).
- `catalog`: lookup e imagen; dueño de `products`.
- `user-library`: guardados e historial.
- `account`: eliminar cuenta, onboarding.
- `feedback`: feedback y reportes de producto.

Más `src/platform/` (infraestructura compartida, no es un módulo de negocio) y `etl/` fuera del deploy (ADR-0004).

Reglas: un módulo solo se importa por su `index.ts`; sin ciclos entre módulos; dependencias permitidas según el mapa de [02-arquitectura.md §2.1](../02-arquitectura.md). Se verifican con `dependency-cruiser` en CI.

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| Dejar la estructura actual y solo borrar lo muerto | No resuelve el acoplamiento ni el "¿dónde va esto?" de cada funcionalidad nueva |
| Capas globales (`controllers/`, `services/`, `repositories/`) | Es lo que hay hoy con otros nombres: un cambio de una capacidad toca N carpetas y las fronteras no se ven |
| Microservicios (lookup, usuario, ETL) | Sobredimensionado: una instancia en plan free, un equipo chico, sin necesidad de escalar partes por separado. Suma red, deploys y consistencia distribuida sin beneficio |
| Paquetes separados (monorepo con workspaces) | Útil si el ETL o el motor se publicaran aparte; hoy agrega configuración sin beneficio. Queda como paso posible si `scoring` pasa a compartirse con native |

## Consecuencias

- **+** Cada funcionalidad nueva tiene un lugar obvio; las fronteras se pueden testear y verificar.
- **+** Se puede extraer un módulo a un servicio aparte más adelante sin reescribirlo, si alguna vez hace falta.
- **−** Mover archivos cambia muchos imports: se hace en PRs chicos, uno por módulo, sin cambios de lógica (Fase 5).
- **−** Hay que mantener la configuración de `dependency-cruiser`.
- **Justificación:** SRP a nivel de módulo; KISS (un proceso, sin red interna); OCP (agregar un módulo no cambia los existentes).
