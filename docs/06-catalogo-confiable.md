# Catálogo confiable: plan de trabajo (propuesta para discutir)

> 2026-10-02 · Estado: **propuesta, sin OK**. Reemplaza el "saneamiento en una sesión aparte" de D-42 / DT-01 por un plan concreto, y ordena DT-02, DT-03 y DT-06 detrás de él (D-92).

**Principio:** el puntaje solo puede ser tan bueno como los datos. Primero datos **completos, verificados y con fuente**; después se recalibra el motor. Ningún dato del catálogo puede ser inventado, tampoco por una IA.

## 1. Diagnóstico (lo verificado en el código el 2026-10-02)

| # | Hallazgo | Evidencia |
|---|---|---|
| 1 | **El ETL completa datos con IA "de memoria".** Con `--enrich`, `etl/enrichment/claudeEnricher.ts` le pide a Claude nutrientes e ingredientes de productos que no tienen ("Sos una base de datos nutricional experta…"). No lee ninguna etiqueta: los genera. Esos productos quedan con `ai_enriched = true` | `claudeEnricher.ts · SYSTEM_PROMPT`, `runMerge.ts · enrichWithAI` |
| 2 | **No hay procedencia por dato.** `products` guarda un `data_source` por producto (off, vtex…), no por campo, y ninguna evidencia (URL, foto de etiqueta, fecha). Hoy no se puede demostrar que un ingrediente o un valor nutricional es verdadero | Esquema de `products` (13 columnas, B-01) |
| 3 | **La nutrición está "por 100 g" y casi nunca hay porción ni contenido neto.** El contenido neto está en ~5 % del catálogo (OFF) y hasta ~16 % en el nombre del producto | DT-03, D-37 |
| 4 | **Datos incompletos que el motor puntúa igual.** Ejemplo real: Rhodesia con sodio 0 teniendo sal; ~28,7 % del catálogo sin puntaje en la última medición | PM-08, DT-02 |
| 5 | **El motor tiene errores de lectura** (aditivo contado 2-3 veces, texto partido, vitaminas obligatorias penalizadas) y **temas de criterio abiertos** (M-1 a M-8: puntúa sin cobertura mínima, el 75 % cae en una banda) | PM-08, `dominio-scoring.md §S7` |
| 6 | **Las descripciones de ingredientes tienen errores y tono de marketing o alarma.** "Aromatizante" con el texto de un cítrico; cacao "Superfood real"; lecitina "Generalmente de soja transgénica. Contiene fitoestrógenos"; sal "Preferir sal marina sin refinar" | `scoring/domain/data/ingredients.ts` (271 entradas), `rubric/impactTable.ts` (54) |

## 2. Principios (no negociables)

1. **Nada sin fuente.** Cada dato (lista de ingredientes, cada nutriente, porción, contenido neto) se guarda con: fuente, evidencia (URL o foto), fecha de captura y estado (`sin_verificar`, `verificado`, `en_conflicto`).
2. **La IA no crea datos.** Se apaga el enriquecimiento "de memoria". Si se usa IA, es solo para **transcribir lo que se ve en una evidencia** (por ejemplo, la foto de una etiqueta), y lo transcrito queda `sin_verificar` hasta que lo confirma una persona o una segunda fuente ([PREGUNTA] 2).
3. **Lo no verificado no se presenta como verdad.** Un producto sin datos verificados suficientes se muestra **"sin puntaje: datos incompletos"** en lugar de un número.
4. **La etiqueta manda.** Ante un conflicto entre fuentes, gana la etiqueta física (es la declaración legal del fabricante: rotulado obligatorio del Código Alimentario Argentino y Ley 27.642).

## 3. Fuentes y cómo se verifica un dato

| Nivel | Fuente | Qué aporta | Confianza |
|---|---|---|---|
| 1 | **Foto de la etiqueta** (propia, de OFF o enviada por usuarios) | Ingredientes, tabla nutricional, porción, contenido neto, octógonos | Máxima: es la evidencia |
| 2 | **Sitio oficial del fabricante** (Mondelez, Arcor, Molinos, etc.) | Ingredientes y tabla nutricional | Alta |
| 3 | **Supermercados** (VTEX: Carrefour, Jumbo, Disco, Vea; Coto, Día) | Ingredientes y nutrición copiados del fabricante; precio y foto | Media: a veces desactualizado o mal cargado |
| 4 | **Open Food Facts** | Todo, cargado por la comunidad; muchas veces con foto de la etiqueta | Media si tiene foto; baja sin foto |
| 5 | **GS1 Argentina** | Que el código de barras existe, marca, nombre, contenido neto | Alta, pero no trae ingredientes ni nutrición |
| 6 | **ANMAT / RNPA** | Que el producto está registrado | Alta, pero no trae ingredientes ni nutrición |
| — | Excluidas | IA generativa, blogs, apps de terceros sin evidencia | — |

**Regla de verificación:** un dato queda `verificado` si (a) hay una foto de etiqueta legible revisada por una persona, o (b) **dos fuentes independientes de nivel 2 a 4 coinciden**. Si difieren, queda `en_conflicto` y va a revisión manual.

## 4. Los cuatro frentes

### W1 · Lista de ingredientes completa y verificada

- **Objetivo:** la lista tal como figura en la etiqueta, completa, en el orden declarado, con los aditivos con su nombre y su INS.
- **Cómo:** cruce automático de fuentes (OFF ↔ supermercados ↔ fabricante) por código de barras; si coinciden, `verificado`; si no, a revisión con la foto. Detectores automáticos de listas incompletas (cortadas, sin aditivos cuando el producto es ultraprocesado, con texto de fabricante mezclado: ya existe `etl/lib/qualityHeuristics.ts`).
- **Hecho cuando:** el producto tiene la lista `verificada` y el motor identifica al menos el X % de sus ingredientes ([PREGUNTA] 4; hoy no hay mínimo, M-1).

### W2 · Información nutricional real y por unidad

- **Objetivo:** la tabla nutricional de la etiqueta con **porción declarada, porciones por envase y contenido neto**, además de los valores por 100 g / 100 ml. La app puede mostrar "por porción" y "por envase" (RF-063, DT-03).
- **Cómo:** mismas fuentes y regla que W1. Controles automáticos de plausibilidad (ya existe `etl/quality/nutrientPlausibility.ts`): energía coherente con macronutrientes (4·carb + 4·prot + 9·grasa ≈ kcal), sodio con sal declarada, azúcares ≤ carbohidratos, unidades (mg contra g).
- **Hecho cuando:** los nutrientes críticos (energía, azúcares, grasas totales y saturadas, sodio) más porción y contenido neto están `verificados`.

### W3 · Componentes comunes de los ultraprocesados, con cuánto restan

- **Objetivo:** una **tabla curada y revisada por el responsable** de los componentes típicos de ultraprocesados: qué es cada uno, para qué se usa, en qué evidencia se apoya y cuánto resta.
- **Punto de partida:** el motor ya tiene 54 entradas de rúbrica y 271 ingredientes; se exportan a una planilla para revisarlas, no se arranca de cero. Más la frecuencia real de cada componente en el catálogo, para priorizar.
- **Grupos iniciales:** aceites refinados (girasol, soja, palma, "aceite vegetal" sin especificar); azúcares agregados (jarabe de maíz de alta fructosa, glucosa, azúcar invertido, maltodextrina); almidones modificados; proteínas aisladas; emulsionantes (lecitina INS 322, mono y diglicéridos INS 471, PGPR INS 476); espesantes (goma xántica INS 415, carragenina INS 407); edulcorantes (sucralosa INS 955, acesulfame K INS 950, aspartamo INS 951); colorantes (caramelo INS 150, tartrazina INS 102); conservantes (sorbato INS 202, benzoato INS 211); resaltadores (glutamato INS 621); aromatizantes; grasas hidrogenadas.
- **Hecho cuando:** cada componente tiene nombre y sinónimos (incluido "nombre (INS nnn)"), función, fuente (CAA, Codex/JECFA, EFSA, OMS/IARC, OPS), impacto propuesto y el OK del responsable. Esto resuelve también los errores de lectura de PM-08.

### W4 · Descripciones de ingredientes útiles y precisas

- **Objetivo:** textos que informen algo real, sin marketing ni alarma.
- **Guía de estilo:** (1) qué es; (2) para qué está en el producto; (3) qué se sabe, con fuente; (4) a quién le importa (alergias, celiaquía, etc.). Máximo ~200 caracteres, sin "superfood", sin "tóxico", sin consejos médicos, sin afirmaciones sin respaldo.
- **Cómo:** cada descripción con su fuente al lado (campo `source`). Se reescriben las 325 entradas por prioridad (las más frecuentes en el catálogo primero) y el responsable las revisa.
- **Hecho cuando:** las descripciones de los componentes que cubren el 90 % de las apariciones en el catálogo están reescritas, con fuente y revisadas.

## 5. Modelo de datos (propuesta)

- **`product_facts`**: un dato por fila, con `product_id`, `field` (ingredientes, energía, azúcares… porción, contenido neto), `value`, `unit`, `basis` (100 g, porción, envase), `source`, `evidence_url`, `captured_at` y `status`.
- **`products` limpia (D-42)**: se arma **solo con datos `verificados`**. Es lo que lee el server; la app no cambia de contrato.
- Los productos hoy `ai_enriched` pasan a `sin_verificar` (no se borran: se re-verifican).

## 6. Fases, en orden

| Fase | Qué | Quién | Sale cuando |
|---|---|---|---|
| 0 | **Medir.** Consultas sobre el catálogo actual: productos por fuente, cuántos `ai_enriched`, con ingredientes, con nutrición completa, con porción y contenido neto, con foto de etiqueta en OFF | Te paso las consultas, las corrés vos (D-58) | Tenemos los números para dimensionar |
| 1 | **Cortar la IA generativa.** Sacar `claudeEnricher` del ETL; marcar los `ai_enriched` como `sin_verificar`; decidir qué ve el usuario de esos productos | Yo, con tu OK | El ETL no puede inventar datos |
| 2 | **Procedencia.** Tablas `product_facts` y la `products` limpia, con migraciones y pruebas | Yo | Cada dato nuevo entra con fuente y estado |
| 3 | **Verificar por lotes**, empezando por los productos más escaneados y los más vendidos: cruce automático de fuentes y revisión manual de conflictos con la foto | Automático yo; revisión manual vos (o quien definas) | El lote prioritario está `verificado` |
| 4 | **W3 y W4** (en paralelo con la 3): tabla de componentes y descripciones | Yo armo; vos aprobás | Tabla aprobada y descripciones revisadas |
| 5 | **Recalibrar el motor** con datos verificados: arreglos de PM-08, mínimo de cobertura (M-1), discriminación (M-6), cobertura de puntaje (DT-02) | Yo, con tu OK sobre cada cambio de puntajes | El puntaje discrimina y se apoya en datos verificados |

## 7. [PREGUNTA]

1. **¿Qué ve el usuario mientras tanto** de los productos sin verificar? (a) el puntaje actual con una marca "datos sin verificar"; (b) "sin puntaje: datos incompletos"; (c) nada hasta verificar.
2. **IA para transcribir etiquetas:** ¿se permite leer la foto de una etiqueta con IA si una persona confirma lo transcrito, o todo a mano?
3. **¿Quién hace la revisión manual** de conflictos y fotos, y cuántas horas por semana? Define cuántos productos podemos verificar.
4. **Cobertura mínima** para emitir puntaje (M-1): ¿qué porcentaje de ingredientes identificados exigimos?
5. **Primer lote:** ¿los N más escaneados, una categoría (galletitas, bebidas…) o los de un supermercado?
6. **Fuentes de fabricantes:** ¿hay contacto con alguna marca para pedir fichas técnicas oficiales?
