# ADR-0003 · Scoring como dominio puro y única fuente de presentación del puntaje

- **Estado:** Propuesto
- **Fecha:** 2026-09-28
- **Relacionado:** [02-arquitectura.md §2.2 y §5.1](../02-arquitectura.md), RF-005, RF-062, D-25
- **Riesgo:** ALTO. Todo cambio requiere los tests de caracterización del paso 1 del plan.

## Contexto

- El motor (`src/domain/product/scoring/**`, v2.3) ya está bien separado: funciones puras, sin I/O, con tests de regresión, calibración, invariantes y goldens. Su fachada es `domain/product/ftgEngine.ts`.
- Pero los **umbrales se duplican fuera del motor**:
  - `productLookupService.ts · mapRawToProduct` calcula `flagged: score < 40`, mientras el motor corta la banda baja en 25 (`constants.ts · BAD_BELOW`). Un producto con 30 puntos sale "Moderado" y `flagged` a la vez.
  - `scorePresentation` (en el mismo archivo) arma `scoreLabel`, `scoreColor`, `tagline` y `fito` fuera del motor.
  - Native decide qué ingredientes destacar con `score < 50` (`ScanResultScreen.tsx`).
- El barrel `scoring/index.ts` exporta ~30 símbolos que nadie consume (knip).
- La fachada mezcla puntaje con parseo de datos crudos (`extractNutrition`, `extractCategory`).
- Se viene la refactorización del motor con metales pesados (D-25), que exige una frontera clara y tests.

## Decisión

1. `scoring` es un módulo de **dominio puro**: no importa nada fuera de sí mismo (ni `platform`, ni paquetes npm, ni builtins de Node). Lo verifica `dependency-cruiser` (`scoring-es-puro`).
2. API pública mínima en `modules/scoring/index.ts`:
   - `scoreProduct(input: ProductInput): ScoreBreakdown`
   - `presentScore(score: number | null): { label, color, fito, highlight }` (sin `tagline`, D-38; sin `sello`, que solo alimentaba la columna eliminada en D-35 y equivale a `fito`; `highlight` reemplaza a `flagged`): **única** fuente de presentación, derivada de `TIERS` / `BAD_BELOW` / `EXCELLENT_FROM`
   - `ENGINE_VERSION` y los tipos que usan `catalog`, `etl` y `scripts`
3. `extractNutrition` y `extractCategory` salen del motor a `catalog/domain/productData.ts`.
4. El cliente **no** recalcula umbrales: si necesita una decisión de presentación (qué grupo destacar), el server la manda derivada (se define en el contrato, Fase 3).
5. La mudanza (`domain/product/scoring/**` → `modules/scoring/domain/**`) se hace **sin cambios de lógica**, con la suite actual verde antes y después y los goldens idénticos.

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| Dejar `presentScore` en el catálogo | Es lo que produce hoy el `40` duplicado: la presentación depende de las bandas, que son del motor |
| Publicar el motor como paquete npm y compartirlo con native | Daría al cliente la tentación de recalcular; hoy el server es la fuente. Se reevalúa si hace falta un modo offline |
| Refactorizar el motor ahora (metales pesados) | Mezcla mudanza con cambio de comportamiento: imposible revisar el diff. Primero se mueve, después se cambia |

## Consecuencias

- **+** Los umbrales viven en un solo archivo (`constants.ts`); cambiar una banda cambia server y presentación juntos.
- **+** El motor se puede testear y evolucionar (D-25) sin tocar infraestructura.
- **−** El cambio de `flagged` (40 → derivado de la banda) **cambia la respuesta** para productos entre 25 y 39: es un cambio de contrato visible, que va en su propio PR, con test y anotado en el changelog del contrato.
- **Tests exigidos:** caracterización de `scoreProduct` sobre los goldens actuales (`regression.test.ts`, `calibration.test.ts`) + test de `presentScore` en cada borde de banda (0, 24, 25, 49, 50, 74, 75, 100, `null`).
