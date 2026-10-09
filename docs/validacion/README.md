# Trabajo de validación de Guille (2026-10-08)

Guille trabajó con un agente el 2026-10-08 sobre el catálogo y dejó tres ramas (`revision/*`) y 32 informes. Los ordenó y evaluó [plan-accion-catalogo.md](../plan-accion-catalogo.md), que es **el punto de entrada**: de ahí salen las tareas y las olas de purga. Las ramas quedan en el remoto y `9a291cc` está marcado con el tag `archivo/validacion-2026-10-08`.

## Cómo leerlo

1. [plan-accion-catalogo.md](../plan-accion-catalogo.md): qué vale, qué no y qué se hace.
2. [ESTADO-CONSOLIDADO-2026-10-08.md](ESTADO-CONSOLIDADO-2026-10-08.md): qué hizo Guille, en sus palabras. Ojo con lo que dice de Barcode Lookup y de los "ocho campos": ver más abajo.
3. El resto de la tabla, según lo que busques.

## Lo que hay que tener presente antes de citar estos informes

- **Barcode Lookup no es una fuente válida** (D-95): es un agregador sin procedencia. Se consultaron 25 páginas sin tener permiso. No se retoma ni se compra la API.
- **Las "15 coincidencias aceptadas" no cuentan como verificación.** Son 15 números que coinciden con una ficha de Barcode Lookup, aceptados por Guille; pueden ser el mismo dato de Open Food Facts repetido.
- **Nada de lo que hay acá está verificado.** Las herramientas son de triage; "sin hallazgos" no significa "validado".
- **La regla de verificación es la de D-98** (una fuente de etiqueta o de marca, con identidad confirmada, que pasa los controles y sin contradicciones). Los informes hablan de "dos fuentes" y de "ocho campos requeridos": eso no es una decisión del proyecto (D-94 son cuatro macros).
- **La alerta `unidad_metadata_por_aclarar` es ruido** con datos de Open Food Facts: `*_unit` es la unidad en que se cargó el dato; `_100g` siempre está en gramos.

## Vigentes

| Documento | Para qué sirve |
|---|---|
| [ESTADO-CONSOLIDADO-2026-10-08.md](ESTADO-CONSOLIDADO-2026-10-08.md) | Resumen de la entrega de Guille (con las salvedades de arriba) |
| [INVESTIGACION-SOLUCIONES-2026-10-08.md](INVESTIGACION-SOLUCIONES-2026-10-08.md) | Errores del ETL y de la presentación, con evidencia |
| [CATALOGO-REVISION-GLOBAL-2026-10-08.md](CATALOGO-REVISION-GLOBAL-2026-10-08.md) y [RESUMEN-CATALOGO-GLOBAL-20261008.json](RESUMEN-CATALOGO-GLOBAL-20261008.json) | Diagnóstico de las 81.444 filas (solo conteos y ejemplos; el resultado por fila no está) |
| [REVISION-R01-NUTRICION.md](REVISION-R01-NUTRICION.md) | R-01, sodio y colesterol: convertir antes de redondear. Incorporada |
| [REVISION-R02-CATEGORIAS.md](REVISION-R02-CATEGORIAS.md) | R-02, acentos en categorías. Incorporada; el prototipo de etiqueta breve no (D-101) |
| [CIERRE-FASE-A.md](CIERRE-FASE-A.md) | Los ocho casos de control y su evidencia (datos en `etl/validacion/`) |
| [ESTANDAR-NUTRICIONAL-C-PROPUESTO.md](ESTANDAR-NUTRICIONAL-C-PROPUESTO.md) y [PUENTE-C-Y-BACKEND-REAL.md](PUENTE-C-Y-BACKEND-REAL.md) | Porción a 100 g y formato de almacenamiento. Referencia para la transcripción de etiquetas (T-14) |
| [BARCODE-PERMISO-CORREGIDO-Y-API-2026-10-08.md](BARCODE-PERMISO-CORREGIDO-Y-API-2026-10-08.md) | Rectificación: no hubo permiso para consultar Barcode Lookup. Línea cerrada |

## Historial (reemplazado o superado)

Están en [`historial/`](historial/). Sirven para reconstruir el proceso; sus conteos y pendientes pueden estar superados.

| Documento | Lo reemplaza |
|---|---|
| `ENTREGA-FASE-A.md`, `PENDIENTES-FASE-A.md`, `chequeos-fase-a.md` | `CIERRE-FASE-A.md` |
| `FASE-B-RESULTADO.md`, `FASE-B-MEJORAS-Y-PILOTO-WEB.md`, `FASE-B-AMPLIACION-Y-REVISION.md`, `DECLARACIONES-Y-FUENTES-FASE-B.md`, `REVISION-B-MUESTRA-200.md`, `CIERRE-B-Y-AVANCE-C.md` | El detector se porta a TypeScript (T-10) |
| `AUDITORIA-Y-AVANCE-C.md`, `CONTINUACION-BC-RESULTADO.md`, `ALERTAS-C-MUESTRA-200.md`, `DECISIONES-PENDIENTES-BC.md` | El plan de acción |
| `BARCODE-BARRIDO-AUTORIZADO-2026-10-08.md`, `RESUMEN-BARCODE-20261008.json` | Rectificados: el permiso no existía |
| `ENTREGA-PARA-JERE.md`, `ESTADO-ACTUAL-Y-COMO-SE-INTEGRA.md`, `RESULTADO-COMPLETO-PARA-REVISAR.md`, `PROCESO-Y-DECISIONES-2026-10-08.md`, `REGISTRO-AUTOAPROBACIONES.md`, `CONTRASTE-Y-ORDEN-DE-FASES.md`, `GUIA-PARA-AGENTES.md` | `ESTADO-CONSOLIDADO-2026-10-08.md` y el plan de acción |
| `evidencia-2026-10-08/` | Salidas de las comprobaciones de Guille |

## Código y datos

Los datos de control están en `etl/validacion/` (ver su README). Las reglas de texto y de nutrición se portaron a `etl/lib/` y `etl/quality/` (T-10) y las herramientas `.mjs` de detección, diagnóstico y Barcode Lookup se borraron; siguen en el tag `archivo/validacion-2026-10-08`.
