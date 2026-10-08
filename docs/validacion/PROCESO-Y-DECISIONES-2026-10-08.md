# Proceso, decisiones y revisión de correcciones

Fecha: 2026-10-08. Responsable de revisión: Guille. Rama local de la primera corrección: `revision/correccion-01-nutricion`. Base del código: `53cbc6e9cf72113f983cdc195dff3030564d68e7`.

Actualización de presentación: Guille descartó el detalle opcional. Mostrar solo etiqueta breve; el prototipo fue ajustado. El estado vigente y la integración pendiente se explican en [ESTADO-ACTUAL-Y-COMO-SE-INTEGRA.md](ESTADO-ACTUAL-Y-COMO-SE-INTEGRA.md). Las propuestas anteriores con recorrido se conservan como historia, no como formato aprobado.

## Propósito

Convertir el análisis del catálogo en mejoras comprobables, con evidencia y revisión humana por cada solución. Este registro permite que otra persona o agente continúe el trabajo sin repetir la investigación ni tratar las propuestas como decisiones ya aplicadas.

El informe inicial permitió distinguir errores del dato, errores de transcripción y errores de presentación. La investigación posterior examinó soluciones y sus límites. La implementación se hará de a una: preparar, comprobar, mostrar el resultado a Guille, incorporar alternativas y registrar su decisión antes de continuar.

## Límites acordados con el usuario

- Supabase es solo lectura. No escribir, crear, borrar ni modificar tablas; no ejecutar migraciones ni procesos de carga. Una propuesta anterior de crear `product_facts` no concede permiso para hacerlo.
- No modificar, publicar ni integrar cambios en `main`. Trabajar en una rama separada.
- No modificar `fitogenix-agents`.
- No publicar código ni desplegar sin confirmación correspondiente. Preparar localmente no equivale a publicar.
- Revisar cada corrección por separado. Las pruebas automáticas no sustituyen la decisión del usuario.
- No completar información nutricional ni ingredientes con datos inventados por IA.

Estos límites proceden de las instrucciones directas del usuario y tienen prioridad sobre propuestas anteriores en documentos.

## Recorrido y evidencia

| Etapa | Qué se hizo | Qué permitió decidir |
|---|---|---|
| Análisis recibido | Se revisaron los problemas de cobertura, ingredientes, nutrientes, identidad y presentación | Separar datos ausentes de datos incorrectos; no asumir que una fila equivale a un producto verificado |
| Fase A | Se prepararon informes, evidencia, propuestas sin aplicar y herramientas de lectura | Registrar diferencias por fuente sin modificar la base |
| Controles de productos | Se compararon fotos y fuentes; el usuario autorizó una segunda lectura independiente de etiquetas | Controlar transcripción; las dos lecturas de una foto no son dos fuentes diferentes |
| Aportes del usuario | Se recibieron tablas de Raptor y Tonadita y el contexto de Sacaan | Mantener sabores/EAN no identificados como pendientes; confirmar la referencia de sodio de Tonadita; cerrar la búsqueda de Sacaan |
| Entrega de documentos | Los nueve archivos de fase A quedaron en `revision/fase-a-2026-10-08`, commit `ccc008881d12c7bf18962873292e61c336d0549b` | Poder revisar la evidencia en GitHub sin integrar a main |
| Investigación de soluciones | Se revisó código del servidor y documentación del equipo en `docs/pm-testing-manual`, commit `5ebc832a3d7c7db419bfd5867612a74ec41d6cf8`; se consultaron fuentes oficiales y ejecutaron diagnósticos locales | Proponer correcciones concretas y detectar contradicciones en las reglas de validación |
| Nuevo acuerdo de trabajo | Guille pidió documentar el proceso y revisar manualmente cada solución | Preparar cambios uno por uno; no aprobar automáticamente todo el plan |

Los números globales del catálogo proceden del análisis recibido, no de una nueva medición completa. Los casos de productos se apoyan en las capturas de fase A. La investigación no garantiza que esas capturas representen el estado actual de toda la base.

La rama de código local parte de `etl-validacion`, con el SHA indicado arriba; no contiene automáticamente los nueve documentos de la rama publicada. Al preparar una futura entrega se deberá comparar e integrar únicamente los archivos aprobados en una rama separada, sin sobrescribir esa evidencia ni asumir que las ramas son intercambiables.

## Decisiones y estados

| Tema | Estado y decisión |
|---|---|
| Supabase y main | Restricciones vigentes; no se relajan por aprobar una corrección |
| Revisión manual por solución | Acordada con el usuario |
| Orden general | Presentación, evidencia/normalización, ingredientes y finalmente puntaje; cada bloque requiere revisión |
| R-01: conversión de sodio/colesterol | Aprobada por Guille el 2026-10-08; preparada localmente, no publicada |
| R-02: categorías y presentación | Preparada en rama local `revision/correccion-02-categorias`; pendiente de revisión humana. Incluye prevención de errores de acentos y prototipo local de etiqueta breve con detalle jerárquico. La conexión a la app y la reparación de datos históricos siguen pendientes |
| Cambios del puntaje | D-92 se mantiene: no recalibrar ni alterar reglas del motor en este bloque |
| Datos ausentes/cero/cualitativos y tabla de pantalla | Propuestas pendientes de revisar con ejemplos; D-94 no se declara resuelta |
| Dos fuentes frente a una fuente de etiqueta/marca | El plan tiene criterios diferentes; la unificación recomendada sigue pendiente de decisión explícita |
| Archivo de datos aprobados leído por el servidor | Alternativa propuesta para preservar la base; todavía no implementada |
| Servicios pagos | No contratados ni autorizados; medir primero la cobertura de fuentes gratuitas |

Las recomendaciones de la investigación son una orientación favorablemente recibida por Guille. No deben interpretarse como permiso para aplicar todas las soluciones, aprobar todos los productos, modificar puntajes o publicar cambios sin su revisión.

El informe de investigación proponía agrupar nutrición y categorías en un primer cambio. Con el acuerdo posterior de revisar cada solución por separado, R-01 contiene solo nutrición y R-02 queda para categorías. Este registro y la revisión activa describen el alcance vigente.

Tras la aprobación de R-01 se conservó en el commit local `76bfd7f` —sin push—. R-02 parte de ese commit. Guille autorizó continuar con categorías mediante “dale segui con eso”; esa autorización permite preparar la solución para revisar, no declararla aprobada ni publicar.

Guille amplió R-02: pidió corregir también cómo se presentan las categorías y ver el resultado conjunto. Se preparó una muestra local con etiqueta breve (`Sal`) y detalle (`Almacén / Sal`), conservando el texto original por separado. No se redujo la categoría usada por el motor ni la almacenada; no se agregaron campos al contrato sin revisar su integración con la app.

## Registro de productos de control

| Caso | Decisión que debe conservarse |
|---|---|
| Tonadita | El usuario confirmó 20 mg de sodio por 10 g. Coincide con 0,2 g por 100 g de la captura. No hace falta modificar ese valor en la base y no se aprueba todo el producto automáticamente |
| Sacaan | Búsqueda cerrada por ahora; mantener incompletos los datos sin evidencia y no reconstruir la tabla del gráfico sin identidad confirmada |
| Protein/Raptor | Cuatro tablas oficiales separadas. No asignar sabor ni asociar al EAN candidato por parecido numérico |
| Bariloche | 80 g y 135 g son presentaciones distintas; carbohidratos pendientes; corregir presentación de sodio sin completar datos |
| Ilolay | Mantener identidades y conflictos por presentación; no copiar fórmula entre los cuatro códigos |
| Doritos | Separar error de presentación —664 mg mostrados como 700— del conflicto de fuentes —664 frente a 672 mg—. Guille aportó 168 mg/25 g: equivalen a 672 mg/100 g; referencia registrada sin modificar la base |
| Rhodesia | Conservar conflictos; no anunciar un nuevo puntaje estimado como solución |
| Monster | Evidencia por 100 ml con contexto de mercado/fecha; no convertirla a 100 g ni asumir fórmula argentina vigente |

## R-01: cambio preparado para revisión

**Problema:** la presentación redondeaba nutrientes expresados en gramos antes de convertir sodio y colesterol a miligramos. Eso perdía cantidades pequeñas y deformaba otras.

**Solución preparada:** convertir primero a la unidad de presentación y redondear después a una cifra decimal. Rechazar entradas vacías, tipos no numéricos y números no finitos. Mantener cero, ausencia, claves y prioridad de lectura actuales. El fallback sin sufijo se conserva por compatibilidad: no se declara resuelto el problema de la base de medida.

| Entrada | Antes | Después |
|---|---:|---:|
| Sodio 0,046 g | 0 mg | 46 mg |
| Sodio 0,362 g | 400 mg | 362 mg |
| Sodio 0,664 g | 700 mg | 664 mg |
| Colesterol 0,0022 g | 0 mg | 2,2 mg |
| Sodio 0,2 g | 200 mg | 200 mg |
| Sodio declarado 0 | 0 mg | 0 mg |
| Sodio ausente | Sin dato | Sin dato |

El cambio no modifica los nutrientes guardados, la fórmula del puntaje, las categorías, los nombres, el merge, el contrato HTTP o el código de la app. El puntaje continúa recibiendo los datos crudos.

Archivos de código de R-01:

- `src/modules/catalog/domain/productData.ts`
- `src/modules/catalog/domain/productData.test.ts`
- `src/modules/catalog/application/__snapshots__/productResponse.test.ts.snap`

Las referencias de respuesta cambian únicamente en dos cifras esperadas de sodio: Coca-Cola de 0 a 5 mg y Nutella de 0 a 40 mg. Son fixtures de pruebas, no modificaciones del catálogo. Los puntajes y el resto de esas respuestas deben quedar iguales.

La evidencia numérica prueba presentación, no veracidad integral del producto. Los casos de robustez y los diagnósticos de merge/GTIN son sintéticos, no estadísticas de incidencia real.

Resultado técnico y límites de los chequeos: consultar `REVISION-R01-NUTRICION.md`. Resultado de revisión humana: **aprobado por Guille el 2026-10-08**, con su mensaje “la primera correcion me parece perfecta”. No equivale a autorización para publicar o desplegar ni a aprobación de una corrección del dato original de Doritos.

## Orden de revisiones siguientes

R-02 está preparada: consultar [REVISION-R02-CATEGORIAS.md](REVISION-R02-CATEGORIAS.md). Al examinar los usos de `extractCategory` se comprobó que la función se llama desde la construcción del payload del ETL, no desde la respuesta de detalle. En la muestra de pruebas hay categorías que ya contienen mayúsculas erróneas. Se conservan como evidencia; este cambio no las reescribe ni aplica una limpieza general que pueda alterar siglas. Ningún proceso de escritura queda autorizado por corregir esa función.

| Revisión | Alcance propuesto | Evidencia para revisar |
|---|---|---|
| R-02 | Categorías y acentos | Ejemplos de nombres de categorías antes/después |
| R-03 | Datos faltantes, ceros y cantidades no significativas; filas nutricionales de la app | Ejemplos de ficha y estados; requiere acceso al código de la app para implementarlo |
| R-04 | Identidad, nombres, códigos y presentaciones | Casos de tamaños/sabores, GTIN y nombre preservado |
| R-05 | Unidades y base: 100 g, 100 ml, porción | Tablas con valor original, conversiones justificadas y límites |
| R-06 | Procedencia y selección de bloques nutricionales | Evidencia por campo; ejemplo OFF sin nutrientes frente a tabla utilizable; salida solo a archivos |
| R-07 | Texto de ingredientes y estructura | Texto original, propuesta, subingredientes y elementos excluidos con motivos |
| R-08 | Alias y deduplicación | Nombre/INS/tags y conteos antes/después; ejecutar fuera del motor hasta aprobar el impacto |
| R-09 | Datos mínimos, verificación y eventual puntaje | Reglas unificadas, métricas y controles; cambios de puntaje requieren autorización específica y respetar D-92 |

No ejecutar toda la lista automáticamente. Si Guille propone una alternativa, preparar una comparación antes de elegirla. No iniciar una revisión siguiente como si la anterior hubiera sido aprobada por silencio.

## Guía de continuidad

Antes de continuar, leer [GUIA-PARA-AGENTES.md](GUIA-PARA-AGENTES.md), la revisión de R-01 y los archivos de fase A en su rama publicada. El informe de investigación contiene las alternativas y fuentes detalladas: [INVESTIGACION-SOLUCIONES-2026-10-08.md](INVESTIGACION-SOLUCIONES-2026-10-08.md).

Este registro describe acciones y decisiones, no sustituye el código ni implica aprobación para desplegar. Actualizar los estados únicamente con evidencia del trabajo y de la respuesta directa del usuario.
