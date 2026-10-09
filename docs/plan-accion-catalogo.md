# Plan de acción del catálogo, a partir del trabajo de Guille

> 2026-10-09 · Estado: **aprobado por Jere el 2026-10-09**; las decisiones quedaron en D-97 a D-101 y la ejecución está en curso. Revisa las ramas `revision/fase-a-2026-10-08`, `revision/entrega-correcciones-2026-10-08` (`f41aa1a`) y `revision/fases-bc-catalogo-2026-10-08` (`9a291cc`), y las ordena contra el plan de [06-catalogo-confiable.md](06-catalogo-confiable.md) y las decisiones D-92 a D-96.

**Resueltas el 2026-10-09:** [PREGUNTA] 3 y 4 (se confía en Guille: D-97), 5 (D-101), 6 (D-98), 9 (D-100) y 11 (D-99). **Siguen abiertas:** 1 (rotar la clave de Supabase), 2 (sodio entero o con decimal; R-01 se mergea con el comportamiento de Guille), 7 (líquidos por 100 ml), 8 (cuatro macros u ocho campos), 10 (códigos de longitud no estándar) y 12 (sin cambios: no se usa Barcode Lookup).

## 1. Qué hay en las ramas

Las tres ramas salen de `main` (`53cbc6e`) y van una encima de la otra. No tocan `main`, ni Supabase, ni el contrato.

| Bloque | Dónde | Qué es | Estado real |
|---|---|---|---|
| R-01 sodio y colesterol | `src/modules/catalog/domain/productData.ts · extractNutrition` | Convierte g a mg **antes** de redondear; valida que el valor sea un número finito | Código productivo, con pruebas. Listo para mergear |
| R-02 acentos en categorías | `productData.ts · extractCategory` | La mayúscula inicial respeta letras con tilde y ñ (`AlmacéN` → `Almacén`) | Código productivo, con pruebas. Solo actúa cuando el ETL escribe |
| Etiqueta breve de categoría | `scripts/preview-product-categories.ts · presentCategory` | `Almacén > Sal` → `Sal` | Prototipo suelto. La categoría no está en el contrato ni en la app |
| Fase A: casos de control | `etl/validacion/{propuestas-finales,evidencia-aportada,controles-finales}-a.json` | 8 casos, 11 códigos de barras, 14 fotos con hash, 8 transcripciones, clasificación campo por campo | Datos de evidencia. Nada aplicado |
| Fase B: texto de ingredientes | `etl/validacion/detectar-texto-b.mjs`, `comparar-fuentes-b.mjs` | Detector de texto que no es ingrediente; comparador contra Barcode Lookup | Herramientas sueltas en JS, fuera del CI |
| Fase C: nutrición | `etl/validacion/{normalizar-panel,diagnosticar-nutricion,puente-panel-backend}-c.mjs` | Porción → 100 g con unidades explícitas; alertas de rangos y relaciones | Herramientas sueltas en JS, fuera del CI |
| Diagnóstico de las 81.444 filas | `docs/validacion/RESUMEN-CATALOGO-GLOBAL-20261008.json` | Conteos agregados y algunos ejemplos | **Solo el resumen.** El script de captura, el comprobador de códigos y el resultado fila por fila no están en el repo |
| Barcode Lookup | `etl/validacion/barcode-web-*.json` y dos informes | 25 códigos consultados: 9 fichas, 16 ausencias | Detenido. No sirve como fuente (ver §3) |
| Documentación | `docs/validacion/` (32 archivos, ~200 KB) | Informes de proceso, varios reemplazados por otros posteriores | Historial, no documentación de referencia |

**Comprobado en esta revisión (2026-10-09, sobre `9a291cc`):** 1.083 pruebas de Vitest en 67 archivos, 90 pruebas de Node de las herramientas, `typecheck`, `lint:deps`, `lint:unused` y `contract:check`: todo verde. La rama mergea con `main` y con el PR #12 sin conflictos. Sin saltos de línea de Windows ni credenciales en los archivos.

## 2. Puntos fuertes

1. **Separa bien los problemas:** dato equivocado, dato ausente, identidad dudosa, error de lectura y error de presentación. Es la distinción correcta y coincide con [analisis_BD_Productos.md](analisis_BD_Productos.md).
2. **Criterio conservador, alineado con D-92, D-95 y D-96:** conserva originales, no completa de memoria, distingue "sin dato" de "cero declarado" y de "cantidad no significativa", no convierte ml a g, no copia datos entre sabores o tamaños.
3. **R-01 está bien hecha:** arregla la causa (redondear antes de convertir), revisó los dos cambios de snapshot uno por uno y no toca el motor.
4. **Los casos de control ya tienen códigos de barras y evidencia.** En el plan faltaban los códigos de siete de los ocho productos (§7 de 06). Ahora están, menos el de la Protein Bar.
5. **Encontró errores del ETL que no teníamos anotados** (en `INVESTIGACION-SOLUCIONES-2026-10-08.md`, verificados acá contra el código):

| Error | Evidencia |
|---|---|
| El merge elige el bloque de nutrición de la fuente de mayor prioridad aunque solo traiga `nova-group`, y descarta una tabla real de otra fuente | `etl/lib/merge.ts · pick('nutriments')` usa `nonEmpty`: cualquier objeto con una clave vale |
| "Completo" significa "tiene alguna clave en `nutriments`" | `etl/lib/completeness.ts · isComplete` |
| La base (100 g o 100 ml) se pierde al importar de Cencosud | `etl/adapters/vtexAdapter.ts`: mismas claves `_100g` para las dos |
| Se aceptan códigos de 9, 10 y 11 dígitos, sin dígito verificador | `etl/lib/barcode.ts · normalizeBarcode` |

6. **Marcó contradicciones del plan 06** que hay que resolver antes de automatizar: "dos fuentes independientes" (§3) contra "una fuente de etiqueta" (§6b, paso 6); el ±20 % no prueba que dos páginas describan la misma fórmula; "contiene sal" no implica sodio mayor que cero.
7. **Es honesto con lo que no hizo:** no afirma haber verificado productos, registra cada decisión del agente y rectificó el permiso de scraping que no existía.
8. **Sus números coinciden con los nuestros:** 62.145 filas sin ingredientes (nosotros 62.141), 99 `ai_enriched`, misma distribución por fuente.

## 3. Lo que no está bien definido o está mal

| # | Problema | Por qué importa |
|---|---|---|
| 1 | **No hay nada verificado.** Las herramientas B/C son de triage: de 2.083 textos con hallazgos, solo 31 tienen una propuesta de limpieza. Las 17.032 filas "sin hallazgos" no están validadas | El trabajo ordena el problema; no purga la base |
| 2 | **El diagnóstico global no se puede repetir.** El script que leyó las 81.444 filas, el comprobador de códigos y el resultado por fila quedaron en "respaldos privados" | Sabemos cuántas filas tienen cada problema, no cuáles |
| 3 | **Barcode Lookup no es una fuente válida según D-95.** Es un agregador sin procedencia: mezcló la Rhodesia con un juguete de LEGO y le da 45 kcal a un queso rallado. Las 15 "coincidencias aceptadas" pueden ser el mismo dato de OFF repetido | Guille las aceptó "como validación del dato". No cuentan como verificación |
| 4 | **1.582 de las alertas de nutrición son ruido casi seguro.** `unidad_metadata_por_aclarar` salta cuando `sodium_unit` dice `mg`, pero en OFF ese campo es la unidad en que se cargó el dato; `_100g` siempre está en g | Las alertas numéricas reales son unas 161: 94 fuera de rango, 40 relaciones imposibles, 27 con macros que suman más de 100 g |
| 5 | **"Ocho campos requeridos" contradice RF-064 / D-94** (cuatro macros siempre). Con ocho campos quedan 1.904 productos; con cuatro macros, 4.157 | Es un criterio que eligió el agente, no una decisión del proyecto |
| 6 | **El detector está ajustado a los ocho casos.** La regla `ocr` busca literalmente `SINT`, `RALLAD0`, `Aguo`, `IMAF`, `4821`, `INS 71` | No detecta OCR roto en general |
| 7 | **Las herramientas duplican lo que ya hay** en `etl/lib/qualityHeuristics.ts`, `etl/quality/nutrientPlausibility.ts`, `etl/lib/barcode.ts` y `etl/jobs/auditDataQuality.ts`, en otro lenguaje (JS con `node:test`) y fuera del CI (`vitest.config.ts` solo incluye `*.test.ts`) | Mergearlas tal cual deja dos sistemas de calidad |
| 8 | **Aprobaciones de una persona escritas en el código:** `preparar-revision-bc.mjs · NUMERIC_ACCEPTANCE_POLICY` lleva `accepted_by:'Guille'` y 15 valores fijos | No es código reutilizable |
| 9 | **El parseo de ingredientes no se tocó.** `scoring/domain/cleaning.ts` sigue partiendo por `". "` y `":"` | Es la causa de buena parte de los ingredientes falsos en pantalla |
| 10 | **Los nombres de fases chocan:** "fases A a D" de Guille, "etapas A a F" y "fases 0 a 5" del plan 06 | Confunde al retomar |
| 11 | **Acceso a la base.** `capturar.mjs` lee `SUPABASE_SECRET_KEY` y el recorrido completo se hizo "con credencial en memoria". Todo indica que Guille tiene la clave secreta (acceso total, no solo a `products`) y una copia completa de la tabla en su máquina | Ver [PREGUNTA] 1 |
| 12 | **Se consultaron 25 páginas de Barcode Lookup sin permiso**, diez de ellas bajo un permiso que después resultó no existir. Sus condiciones excluyen la extracción automatizada fuera de la API | Ya está detenido. No retomar |

## 4. [PREGUNTA]: lo que tenés que decidir vos

| # | Decisión | Recomendación |
|---|---|---|
| 1 | **Clave secreta de Supabase en la máquina de Guille** | Rotarla y, si va a seguir ayudando, darle un acceso de solo lectura limitado a `products` |
| 2 | **Sodio con decimales.** Con R-01 el sodio puede salir `362,4 mg`; la app muestra el valor tal cual (`ScanResultScreen.tsx · row.value`) | Sodio en mg enteros, colesterol con un decimal |
| 3 | **Tonadita: ¿20 mg o 12 mg de sodio por porción?** Guille "confirmó" 20 mg; la foto del envase en OFF dice 12 mg y en el plan 06 ese dato figura `en_conflicto` | Mirar el envase. Hasta entonces, `en_conflicto` |
| 4 | **Doritos: 664 o 672 mg de sodio por 100 g.** 672 sale de un dato que aportó Guille (168 mg cada 25 g) | Igual: envase o foto de etiqueta; no reemplazar por un dato dictado |
| 5 | **¿Mostrar la categoría en la app?** Hoy no está en el contrato. Las categorías de los supermercados son góndolas ("Mesa Dulce Navideña"), no tipos de alimento | No ahora. No resuelve ningún problema de datos y abre uno de semántica |
| 6 | **Regla de verificación** (contradicción del plan 06) | `verificado` = una fuente de etiqueta o de marca, con identidad confirmada, que pasa los controles y sin ninguna fuente que la contradiga. La doble transcripción controla la lectura, no cuenta como segunda fuente |
| 7 | **Líquidos:** cómo guardar y mostrar datos por 100 ml | Guardar la base junto al dato (`basis`); mostrar "por 100 ml". Nunca convertir a gramos |
| 8 | **Completitud mínima:** ¿cuatro macros (D-94) u ocho campos? | Cuatro macros para mostrar la tabla; el resto, si está |
| 9 | **Filas vacías (59.893):** ¿se borran o se quedan? | Se quedan: tienen código, nombre, marca e imagen, y son la cola de lo que hay que verificar. Hoy el server ya las trata como "no encontrado" (`productRow.ts`) |
| 10 | **Códigos de longitud no estándar (1.675):** no se pueden escanear | Listarlos y borrarlos si son códigos internos del supermercado |
| 11 | **Arreglos del parseo de ingredientes** (`cleaning.ts`): cambian puntajes, y D-92 los frena | Hacerlos antes que la recalibración, como excepción acotada: corrigen la lectura, no el criterio. Con informe de puntajes antes y después sobre los productos de control |
| 12 | **API paga de Barcode Lookup** | No. Sus datos no tienen procedencia y D-95 no los admite |

## 5. Qué código es relevante

| Cambio | Veredicto | Motivo |
|---|---|---|
| `extractNutrition` (R-01) + `productData.test.ts` + 2 snapshots | **Mergear** | Arregla que el 25 % de los productos con sodio muestren 0. No afecta el puntaje (el motor lee los crudos) |
| `extractCategory` (R-02) + `productCategory.test.ts` + caso en `supabaseProductWriter.test.ts` | **Mergear** | Correcto y sin riesgo para el motor: todos los `categoryPattern` de `rubric/anchors.ts` son insensibles a mayúsculas. No repara las filas ya guardadas |
| JSON de la fase A | **Mergear como datos de control** | Es la base de la etapa B del plan 06 |
| Reglas de `detectar-texto-b.mjs` (rótulo, alérgenos, conservación, fortificación, sin TACC, unidades sueltas, paréntesis, saltos de línea, INS repetido) | **Portar a TypeScript** dentro de `etl/lib/qualityHeuristics.ts` | Amplía `checkIngredientsText`. Sin la regla `ocr` |
| Relaciones de `diagnosticar-nutricion-c.mjs` (azúcares ≤ carbohidratos, saturadas y trans ≤ grasas, macros ≤ 100 g) | **Portar** a `etl/quality/nutrientPlausibility.ts` | Hoy solo hay rangos |
| `normalizar-panel-c.mjs` + `puente-panel-backend-c.mjs` | **Portar cuando se construya la transcripción de etiquetas** | Porción → 100 g y mg → g de almacenamiento, bien resueltos |
| `capturar.mjs` (lectura de OFF y VTEX por código, con fotos) | **Reusar la idea** en el paso "juntar evidencia" | Tal cual exige una rama y trae los códigos fijos |
| `panelFormat.integration.test.ts` | **No mergear así** | Lee un fixture de `docs/` por ruta relativa y no sigue el estilo del repo |
| `preview-product-categories.ts` | **No mergear** hasta decidir [PREGUNTA] 5 | Prototipo sin uso |
| `comparar-fuentes-b.mjs`, `preparar-revision-bc.mjs`, `barcode-web-*.json` | **No mergear** | Atados a Barcode Lookup y a aprobaciones fijas |
| 32 documentos de `docs/validacion/` | **No mergear** | Se destilan en este plan; quedan en la rama como archivo |

## 6. Cómo mergear

No se mergea ninguna rama entera: los commits mezclan código con informes (`76bfd7f` trae R-01 más cuatro documentos). Se arman ramas nuevas desde `main` con los archivos elegidos, con Guille como coautor del commit.

| Orden | Rama y PR | Contenido | Se comprueba con |
|---|---|---|---|
| 0 | PR #12 (`docs/pm-testing-manual`), ya abierto | Análisis de la base y plan 06 al día | Mergear primero: los demás actualizan esos documentos |
| 1 | `fix/r01-sodio-colesterol` | `extractNutrition`, sus pruebas, los dos snapshots y el ajuste de [PREGUNTA] 2 | Suite completa; después del deploy, turrón Bariloche en el iPhone: sodio 0 → 46 mg |
| 2 | `fix/r02-categoria-acentos` | `extractCategory` y sus pruebas | Suite completa. Sin efecto visible hasta la tarea T-03 |
| 3 | `chore/productos-de-control` | Los tres JSON de la fase A en `etl/validacion/`, este plan y el plan 06 actualizado | Revisión tuya de los ocho casos contra el envase |
| — | Ramas `revision/*` | Se dejan en el remoto y se marca `9a291cc` con el tag `archivo/validacion-2026-10-08` | — |

## 7. Tareas que restan

Ordenadas de la más fácil a la más difícil dentro de cada grupo.

**Presentación (visible enseguida)**

| ID | Tarea | Depende de |
|---|---|---|
| T-01 | Mergear y desplegar R-01 | [PREGUNTA] 2 |
| T-02 | Mergear R-02 | — |
| T-03 | Reparar las categorías ya guardadas (`AlmacéN`): SQL que te paso para correr | T-02 |
| T-04 | App: tabla nutricional con los cuatro macros siempre (RF-064). Hoy `productResultView.ts · nutritionRowsOf` muestra las primeras cuatro filas con dato | [PREGUNTA] 8 |

**ETL: dejar de generar datos malos**

| ID | Tarea | Depende de |
|---|---|---|
| T-05 | `normalizeBarcode`: validar longitud y dígito verificador | — |
| T-06 | `isComplete` y `merge.ts`: un bloque de nutrición cuenta si trae nutrientes reales, no cualquier clave | — |
| T-07 | Sacar `claudeEnricher` del ETL (etapa D del plan 06) | Tu OK |
| T-08 | `vtexAdapter`: conservar la base (g o ml) | [PREGUNTA] 7 |
| T-09 | Parseo de ingredientes en `cleaning.ts` | [PREGUNTA] 11 |

**Herramientas de validación**

| ID | Tarea | Depende de |
|---|---|---|
| T-10 | Portar las reglas de texto y de nutrición a TypeScript, con pruebas en Vitest | — |
| T-11 | `etl:audit-quality` deja un archivo con una fila por producto y sus marcas; reemplaza al diagnóstico privado de Guille | T-10 |
| T-12 | Job de fidelidad a la fuente: compara lo guardado con lo que publica hoy OFF (volcado) y VTEX | T-11 |
| T-13 | Productos de control: revisar los ocho contra el envase, conseguir el código de la Protein Bar, sumar hasta 30 | Vos |
| T-14 | Transcripción de fotos de etiqueta con doble lectura y controles (§6b del plan 06) | [PREGUNTA] 6, T-13 |
| T-15 | `product_facts`: procedencia por dato (§5 del plan 06) | Migración, con tu OK |

## 8. Plan para purgar la base

**Criterio:** como todavía no hay usuarios, se limpia sobre la tabla real, por olas, de lo seguro a lo dudoso. Cada ola: lista de filas afectadas en un archivo → la revisás → SQL que corrés vos (D-58) → conteo antes y después. Nada se borra sin copia previa.

Cuatro niveles de validación; solo N2 y N3 cuentan como `verificado`:

| Nivel | Qué comprueba | Cómo | Alcance |
|---|---|---|---|
| N0 · Estructura | Código válido, tipos, unidades, rangos, relaciones entre nutrientes, texto que no es ingrediente | Reglas sin red (T-10, T-11) | Las 81.444 filas |
| N1 · Fidelidad a la fuente | Lo guardado es lo que publica la fuente declarada | Comparación automática (T-12) | Las ~21.500 filas con algún dato |
| N2 · Etiqueta | Coincide con la foto de la etiqueta o con una fuente de la marca | Transcripción doble y cruce (T-14) | Las que tengan foto |
| N3 · Envase | Coincide con el producto físico | A mano | Productos de control |

### Olas

| Ola | Qué se purga | Filas | Validación | Acción | Sale cuando |
|---|---|---:|---|---|---|
| 0 | Nada: copia de seguridad y diagnóstico repetible | 81.444 | — | Exportar `products` a un archivo con hash (fuera de git). Correr T-11 | Hay un archivo con las marcas de cada fila y los conteos coinciden con los de §1 |
| 1 | Datos generados por IA | 99 | N0 | Vaciar `ingredients_text`, `nutriments` y `additives_tags` de las filas `ai_enriched` y volver a armarlas desde las fuentes, sin `--enrich`. **Hay que vaciar antes:** el merge toma la fila existente como fuente de último recurso (`merge.ts · existing`) y si no, el dato inventado sobrevive | Cero filas `ai_enriched`; T-07 hecha |
| 2 | Códigos inválidos | 67 + 1.675 | N0 | Los 67 con dígito verificador malo: buscarlos en OFF y VTEX; si no existen, borrar. Los 1.675 de longitud rara: [PREGUNTA] 10 | Todo código de la tabla es un GTIN válido |
| 3 | Nutrición imposible | ~161 marcas | N0 + N1 | Por cada una, releer la fuente. Si la fuente trae un valor coherente, se reemplaza; si no, el **bloque entero** de nutrición queda vacío ("sin dato") | Cero filas con valores fuera de rango o relaciones imposibles |
| 4 | Nutrición que el ETL arruinó | A medir | N1 | Con T-06 hecha, volver a correr el merge sobre las filas donde lo guardado difiere de la fuente | Lo guardado coincide con la fuente en todas las filas con nutrición |
| 5 | Texto de ingredientes contaminado | 2.083 + los que marque T-10 | N0 | (a) Las 31 limpiezas mecánicas (quitar el rótulo "Ingredientes:"): revisarlas y aplicarlas. (b) El resto no se arregla con reglas: se vacía `ingredients_text` y el producto queda sin puntaje hasta la ola 6 | Ningún producto con puntaje tiene texto marcado |
| 6 | Todo lo que no se pueda verificar | ~19.300 con ingredientes | N2 | Piloto sobre los productos de control y 200 más (etapa C del plan 06); después por lotes, empezando por los más escaneados. Cada producto queda `verificado`, `en_conflicto` o `sin_verificar` | Criterio del plan 06: ningún dato equivocado queda `verificado` |
| 7 | Publicar | — | — | El server da puntaje solo a lo `verificado`; el resto, "sin puntaje: datos incompletos" (etapa F) | — |

**Qué se puede hacer ya, sin ninguna decisión:** ola 0, T-02, T-05, T-06, T-10 y T-11. Las olas 1 a 5 son deterministas y se cierran con herramientas que casi están; la ola 6 es el trabajo largo del plan 06 y depende de las [PREGUNTA] 6 y 7.

**Qué no hace este plan:** no cambia el criterio del puntaje (D-92), no completa datos faltantes y no borra las filas vacías.
