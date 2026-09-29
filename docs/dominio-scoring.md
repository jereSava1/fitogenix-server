# Dominio del puntaje: qué evalúa el motor y con qué fundamento

> Fecha: 2026-09-29 · Verificado contra `fitogenix/refactor-cleanup` (motor `ENGINE_VERSION` = `ftg-rubric-v2.3`).
> Reemplaza como fuente a `fitogenix-agents/docs/CONTEXT.md` (§1–§3, §8) y `fitogenix-agents/nutricion/NUTRICION.md`, que **no son fuente de verdad** (ver [README](README.md)). De ahí se trajo solo lo que se verificó contra el código y no choca con [`decisiones.md`](decisiones.md); lo que choca queda al final como [PREGUNTA].
> **Regla:** los umbrales **vigentes** no se transcriben acá; viven en el código y se citan por archivo + símbolo. Los valores de la §S4 son **los de la norma** (la fuente contra la que se contrasta el código), no la implementación.

## §S1 — Qué evalúa Fitogenix, y qué no

- **Evalúa productos, no personas.** Un envase con su lista de ingredientes y su panel nutricional. No hay consejo dietario, condiciones de salud ni recomendación individual. Un puntaje alto no es "esto te hace bien": es "según nuestro criterio declarado, este producto tiene una lista de ingredientes mejor que la mayoría".
- El texto del límite que ve el usuario vive en `scoring/constants.ts · DISCLAIMER` y no se reescribe en el copy sin pasar por ahí.
- **Sin lista de ingredientes no hay puntaje**, y eso deja afuera a los alimentos frescos (una verdura sin etiqueta sale "sin datos"). No es un bug, pero el límite no se le declara al usuario: ver §S7, M-5.

## §S2 — Cómo se arma el puntaje

- El puntaje es una **función de la lista de ingredientes**: parte de una base, resta por impacto y por posición de cada ingrediente, aplica un modificador de procesamiento (por marcadores de ultraprocesado en el texto, **no** por `nova_group`), los techos y las anulaciones, y clampea. Los nutrientes restan a través de los octógonos (§S4).
- **Todos los coeficientes** están en `scoring/constants.ts`; la ejecución, en `scoring/steps.ts` y `scoring/pipeline.ts`.
- **Todo puntaje es reconstruible:** `breakdown.steps` es la salida principal y `scoring/ledger.ts · ScoreLedger` hace imposible mover el número sin registrar el paso. Lo verifican `calibration.test.ts · expectStepsReconstructScore` y los goldens (`regression.test.ts`, `catalogGolden.test.ts`).
- **No se inventa:** un ingrediente que no está en la tabla (`ingredientData.ts`, `scoring/rubric/`) queda **no identificado**, con su costo y su techo. No se estima por analogía.
- El motor v2 (cuatro componentes ponderados: toxicidad, nutrición, procesamiento, alineación, y el modificador NOVA) **ya no existe** desde v2.1: los puntajes de v2 no son comparables. Todo texto que describa esos componentes está desactualizado (hoy: `fitogenix-native · ScoringExplainerModal`, ver K-09).

## §S3 — Bandas, sello Fitogénico y "sin datos"

- Bandas, sello y estado salen **del mismo lugar y con los mismos cortes**: `scoring/constants.ts · TIERS`, con `EXCELLENT_FROM` y `BAD_BELOW` derivados de ahí. Se presentan con `scoring/presentation.ts` (`getScoreLabel`, `getScoreTagline`, `getSello`, `resolveProductStatus`).
- **El sello es una propiedad de la banda:** la banda más alta lleva el sello positivo, la más baja el negativo, y las del medio van sin sello. Mover el sello es mover un borde de banda.
- **`null` es una banda, no un cero:** sin datos suficientes no hay puntaje, se muestra su propio mensaje (`NO_DATA_TIER`) y no hay sello.
- **Solo el server calcula.** La app muestra lo que recibe; cómo le llegan las bandas: D-62 y D-63 (contrato generado, K-08 y K-09).
- Por qué la regla existe: hubo tres criterios distintos para la misma decisión (bandas, estado y sello con cortes propios) y un producto salía "Bueno" y "Fitogénico" a la vez (encabezado de `scoring/presentation.ts`).

## §S4 — Los octógonos: insumo interno del puntaje

### Qué son para Fitogenix

- Los octógonos de la Ley 27.642 **se calculan**, no se leen de la fuente (el campo "sellos" de los supermercados trae certificaciones, no advertencias): `scoring/seals.ts · computeWarningSeals`. Restan en el puntaje: `scoring/steps.ts · applyNutrition` y `seals.ts · sealPenalty`.
- **Restan puntos y no se muestran** (decisión de producto del 2026-08-31). El motivo es estructural: el método oficial calcula el nutriente **añadido** desde la **formulación** del producto, y Fitogenix solo tiene la **etiqueta** (lista en orden y panel por 100 g). Lo que el motor calcula es necesariamente una **aproximación**: mostrada como dato contrastable contra el envase sería deshonesta; como insumo de un criterio declarado es legítima. La vara pasa de regulatoria a **discriminativa**: importa que el descuento ordene bien los productos.
- Por eso ningún texto puede presentar el octógono como "lo que el usuario puede contrastar mirando el envase", y la nota del paso nutricional no lo nombra (`steps.ts · applyNutrition`).
- "Sello" es ambiguo en este proyecto: se escribe **octógono** (advertencia legal) o **sello Fitogénico** (§S3), nunca "sello" a secas.

### Qué dice la norma (fuente, no implementación)

- **Nutrientes críticos** (Ley 27.642): azúcares **añadidos**, grasas saturadas, grasas totales, sodio y calorías, más leyendas para edulcorantes y cafeína. **No hay octógono de grasas trans** (la ley no lo incluye, a diferencia del perfil de OPS).
- **Excepciones, art. 7:** alimentos in natura e ingredientes culinarios sin adición de nutrientes críticos, alimentos para propósitos médicos, suplementos y fórmulas infantiles. El criterio de exención es el **nivel de procesamiento**, no la composición. No llevan rotulado frontal: azúcar, aceites vegetales, frutos secos y sal de mesa.
- **Cada octógono se evalúa solo si ESE nutriente fue agregado** (árbol de decisión del Manual, pág. 13). Qué cuenta como añadido (Manual, págs. 10-11): azúcares agregados, jarabes, miel, jugos y concentrados de fruta, y la lactosa usada como ingrediente; **no** el azúcar de frutas y hortalizas enteras o en trozos. En lácteos, solo la grasa que excede la de una leche de hasta 6 %. El sodio cuenta aunque venga de un aditivo.
- **Las calorías no son un nutriente crítico:** su octógono sale solo si el producto **ya** lleva el de azúcares, grasas totales o grasas saturadas, **y** supera el límite de energía. El sodio no habilita el de calorías (Manual, págs. 10 y 17).
- **Tabla 1, segunda etapa (vigente)**, Decreto 151/2022, art. 6 y Anexo I:

| Nutriente crítico | Segunda etapa |
|---|---|
| Azúcares añadidos | ≥ 10 % de la energía |
| Grasas totales | ≥ 30 % de la energía |
| Grasas saturadas | ≥ 10 % de la energía |
| Sodio | ≥ 1 mg/kcal **o** ≥ 300 mg/100 g; bebidas sin aporte energético: ≥ 40 mg/100 ml |
| Calorías (con otro octógono) | alimentos ≥ 275 kcal/100 g · bebidas ≥ 25 kcal/100 ml |

La tabla está confirmada por tres fuentes independientes: el anexo del decreto, la calculadora oficial de ANMAT y el Manual. Las disposiciones ANMAT de 2024 **no cambian los valores**: la 11362/2024 aprueba el Manual (precisa qué es "añadido") y la 11378/2024 regula publicidad.

### Estado del código contra la norma (verificado 2026-09-29)

| Regla | Código (`scoring/seals.ts`) | |
|---|---|---|
| Azúcares añadidos, grasas saturadas, grasas totales | `ENERGY_SHARE`; azúcares solo con `hasAddedSugar` | ✅ |
| Sodio, dos condiciones | `SODIUM_PER_KCAL` o `SODIUM_PER_100G` | ✅ |
| Sodio en bebidas sin energía | `SODIUM_PER_100ML_NO_ENERGY` con `NO_ENERGY_KCAL` | ✅ con aproximación (abajo) |
| Calorías sólidos y bebidas, solo con otro octógono | `CALORIE_LIMIT` | ✅ |
| Sin octógono de grasas trans | — | ✅ |
| Excepción de alimentos sin nutrientes críticos añadidos | `steps.ts · applyNutrition` corta antes de calcular | ✅ con aproximación (abajo) |

**Aproximaciones declaradas:**
1. "Sin aporte energético" es ≤ 4 kcal **por porción**; el motor solo tiene el panel por 100 ml y usa ≤ 4 kcal/100 ml. Es más inclusiva: puede marcar alguna bebida de más.
2. La excepción del art. 7 se aplica **por aproximación** ("ningún ingrediente tiene impacto"), no por el criterio legal ("in natura o ingrediente culinario"). Coinciden en los casos típicos; un ingrediente culinario que la tabla marque con impacto queda adentro cuando la ley lo deja afuera. Ver §S7, M-7.

**Un cambio en estos cálculos cambia el puntaje:** lleva bump de `ENGINE_VERSION` (Redis invalida por versión) y actualiza los goldens a propósito.

## §S5 — Lo que el puntaje no puede decir

La Disposición ANMAT 11378/2024 (Anexo I) obliga a los fabricantes, no a Fitogenix, pero sirve de espejo para el copy: prohíbe presentar un alimento como **garantía de salud** (2.2.9), **cuantificar la reducción del riesgo** de enfermedad (2.2.10) e invocar **el aval** de expertos o asociaciones (2.2.5). El puntaje de Fitogenix no es ninguna de esas tres cosas, y el copy tiene que seguir dejándolo claro.

## §S6 — Fuentes

| # | Fuente | Para qué |
|---|---|---|
| F1 | Decreto 151/2022 (reglamenta la Ley 27.642), InfoLEG `362577` | Nutrientes críticos, excepciones del art. 7, etapas, art. 6 |
| F2 | OPS, modelo de perfil de nutrientes (anuncio 2016, `paho.org`) | Criterios del perfil y su ámbito (procesados y ultraprocesados) |
| F6 | Anexo I del Decreto 151/2022 (Tabla 1 con las dos etapas) | Valores de corte |
| F7 | Calculadora oficial de ANMAT (SIFEGA), corrida el 2026-08-31 | Confirmó el sodio en dos condiciones y el corte de calorías de bebidas |
| F4 / F10 | Disposición ANMAT 11362/2024 y su **Manual de Aplicación**, Revisión I (`IF-2024-135393117-APN-DLEIAER#ANMAT`, 60 págs.) | Qué es "añadido", árbol de decisión, calorías, bebidas sin energía |
| F5 / F9 | Disposición ANMAT 11378/2024 y su Anexo I (`IF-2024-139959417-APN-DRI#ANMAT`) | Publicidad (§S5) |

Los PDF de F10 y F9 **no se versionan en este repo** (D-64): se citan por su identificador oficial, y hay copias locales en `fitogenix-agents/nutricion/fuentes/` (el Boletín Oficial bloquea la descarga automática). **Falta** la publicación completa del modelo de OPS (`iris.paho.org`): es el fundamento científico de cada umbral y hace falta para auditar el criterio propio (§S7, M-3).

## §S7 — Temas abiertos del motor

Relevados en `CONTEXT.md §6` y `§8` y re-verificados contra el código el 2026-09-29. **No son parte de la limpieza:** van con la refactorización del motor (RF-062, L-05) y el saneamiento del catálogo (D-42, DT-01). Registrados como [DT-06](deuda-tecnica.md).

| # | Tema | Estado verificado |
|---|---|---|
| M-1 | **El motor puntúa sin haber entendido la etiqueta:** no hay un mínimo de cobertura de ingredientes identificados para emitir puntaje (caso medido: un té "Excelente" con 0 % de cobertura) | Abierto: no hay gate de cobertura en `scoring/gates.ts` |
| M-2 | **La cola de curaduría se calcula y se tira:** `scripts/audit-scores.ts · CURATION_QUEUE` junta los términos no identificados y nunca se imprime | Abierto |
| M-3 | **Falta el fundamento científico del criterio propio** (publicación completa de OPS); sin eso, M-1 y M-6 no se pueden cerrar con criterio | Abierto |
| M-4 | **Ingredientes reales sin alias:** el motor no los ve y calcula mal. Caso testigo: la sigla `jmaf` figura en la descripción de "jarabe de maíz" (`ingredientData.ts`) pero no en sus `aliases` | Abierto |
| M-5 | **Frescos sin puntaje, y no se declara** (§S1) | Abierto: decidir si se declara el límite o si hay criterio sin lista |
| M-6 | **El puntaje casi no discrimina:** medido el 2026-09-19, el 75 % de los productos puntuados cae en la misma banda (la más angosta). No lo arreglan los cortes sino cómo el motor reparte los puntajes | Abierto. Hace falta contrastar contra fuentes externas antes de tocar coeficientes |
| M-7 | La excepción del art. 7 por aproximación (§S4) | Abierto: medir cuánto diverge del criterio legal antes de cambiar nada |
| M-8 | ¿El descuento de octógonos sigue los cortes de la norma o los de OPS? Como el octógono ya no se muestra, no hay obligación de seguir a la norma. Hoy sigue a la norma | Sin decidir (producto) |
| — | El recompute del catálogo por `engine_version` nunca se escribió | **Se vuelve innecesario** con D-35: al eliminar las columnas denormalizadas no queda nada que recalcular en la base |

## [PREGUNTA]

1. ~~**NOVA.**~~ Resuelta: **D-36 confirmada** el 2026-09-29 (solo el 4,9 % del catálogo tiene `nova_group`; el motor detecta ultraprocesados por marcadores propios). M-7 se resuelve sin NOVA.
2. ~~**Fuentes primarias.**~~ Resuelta: D-64 (se citan, no se versionan).
