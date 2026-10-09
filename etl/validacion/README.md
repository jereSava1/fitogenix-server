# etl/validacion

Datos de control y herramientas sueltas de la validación de Guille (2026-10-08). Contexto: [`docs/validacion/README.md`](../../docs/validacion/README.md) y [`docs/plan-accion-catalogo.md`](../../docs/plan-accion-catalogo.md).

| Archivo | Qué es |
|---|---|
| `propuestas-finales-a.json`, `evidencia-aportada-a.json`, `controles-finales-a.json` | Los ocho productos de control (fase A): valores actuales, candidatos y evidencia. Nada aplicado |
| `fixtures/paneles-backend-c.json` | Lo lee `src/modules/catalog/routes/panelFormat.integration.test.ts` |
| `auditar-etiquetas-a.mjs`, `capturar.mjs` | Control de los JSON de la fase A y captura de lectura (solo GET) |
| `normalizar-panel-c.mjs`, `puente-panel-backend-c.mjs` (con sus pruebas y `paneles-c-muestra.json`) | Porción a 100 g y formato de almacenamiento. Referencia para la transcripción de etiquetas (T-14) |

Las herramientas de texto de ingredientes y de nutrición (detector, diagnóstico, auditor del catálogo) y las de Barcode Lookup se borraron el 2026-10-09: están portadas a TypeScript (`etl/lib/qualityHeuristics.ts`, `etl/quality/nutrientPlausibility.ts`, `etl/jobs/auditDataQuality.ts`) o descartadas (D-95). Siguen en el tag `archivo/validacion-2026-10-08`.

Pruebas de las que quedan: `node --import tsx --test etl/validacion/*.test.mjs` (fuera del CI).
