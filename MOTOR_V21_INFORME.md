# Motor de puntuación v2.1 — informe de implementación

Estado: **implementado, refactorizado y testeado en `fitogenix-server`**. `tsc --noEmit` limpio, 189 tests del motor en verde.

---

## 1. Cómo quedó el motor

Dos archivos de 1683 y 1313 líneas pasaron a una carpeta con un módulo por
responsabilidad. Ninguno llega a 370 líneas salvo la tabla de ingredientes,
que es datos.

```
src/domain/product/
├── ftgEngine.ts          fachada: punto de entrada estable + utilidades de producto
├── ingredientData.ts     la tabla de §4 crecida (271 registros con su prosa)
├── productService.ts     utilidades que no son puntuación
└── scoring/
    ├── types.ts          el contrato: todas las formas del dominio, sin lógica
    ├── constants.ts      los números de §2, juntos y auditables
    ├── text.ts           utilidades de string puras
    ├── rubric/           el documento traducido a datos, una sección por archivo
    │   ├── scope.ts        §1  cuándo no se puntúa
    │   ├── anchors.ts      §3  productos que SON un ingrediente
    │   ├── impactTable.ts  §4  la tabla de ingredientes
    │   ├── annulments.ts   §5  lo que fuerza la categoría Malo
    │   └── labels.ts       §6 y §4.7  lo que hay en una etiqueta y no es ingrediente
    ├── catalog.ts        única puerta a ingredientData
    ├── matching.ts       consultas puras sobre la rúbrica
    ├── cleaning.ts       §6  limpiar la etiqueta antes de contar
    ├── classify.ts       ingrediente limpio → clasificación (cadena de reglas)
    ├── gates.ts          §1 y §5  cuándo no se puntúa y cuándo anula
    ├── ledger.ts         el acumulador que garantiza la reconstruibilidad
    ├── steps.ts          §2 pasos 2-4, cada uno una función pura
    ├── seals.ts          octógonos Ley 27.642
    ├── explain.ts        §7  el armado de la salida
    ├── pipeline.ts       §2  la orquestación, en el orden del documento
    ├── presentation.ts   puntaje → label, color, tagline, sello, estado
    └── *.test.ts         los tests, al lado del código que prueban
```

### Las tres decisiones de diseño que importan

**1. `ScoreLedger` hace imposible romper la regla 1.**

"Todo puntaje tiene que ser reconstruible" era una convención: había que
acordarse de empujar un paso cada vez que se tocaba el número. Una convención
se rompe el día que alguien agrega un `score -= 3` apurado.

Ahora el libro es inmutable y la única forma de mover el puntaje es un método
que además registra la fila. No hay camino para desincronizar el desglose del
resultado, y hay tests que fijan el invariante.

**2. La clasificación es una cadena de resolutores, no una escalera de `if`.**

El orden de precedencia de §4 —número E, marketing, tabla, abreviatura,
aditivo genérico, jugo, catálogo, no identificado— es ahora un array que se
lee de arriba a abajo. Cada regla se testea sola y agregar una es agregar una
función, no meter una rama en el medio de veinte líneas.

**3. Los datos están separados de las reglas, y las reglas del cálculo.**

`rubric/` no ejecuta nada. `constants.ts` son los seis coeficientes y nada
más. Sumar un ingrediente a la tabla no toca una sola función del motor — que
es exactamente lo que el documento pide: "pocas reglas, muchos ingredientes".

### Dos bugs que aparecieron al refactorizar

- **Restas fantasma.** El desglose por ingrediente mostraba la resta que le
  habría tocado a cada uno, aunque en un producto con ancla o con anulación
  esa resta nunca se aplicó. El aceite de girasol salía con "−13" al lado y su
  puntaje venía del ancla. Corregido y con test.
- **Tres umbrales para la misma decisión.** Las bandas cortaban en 75/50/25,
  el estado del producto en 70/50 y el sello en 75/25. Un producto de 72 salía
  "Bueno / Buena opción" y a la vez con estado "Fitogénico". Ahora los tres
  salen de `TIERS` y hay un test que recorre los 101 puntajes posibles
  verificando que no se contradigan.

### El resto del cambio

| Archivo | Qué es ahora |
|---|---|
| `src/types/fitogenix.ts` | `score: number \| null`, `+ scoreAvailable`, `+ noScore`, `− subscores`. |
| `src/services/productLookupService.ts` | Los ingredientes salen del mismo breakdown que el puntaje, no de una segunda pasada. |
| `scripts/audit-scores.ts` | Reglas adaptadas + acumula la cola de curaduría de §9. |
| `scripts/capture-golden.ts` | El golden congela **la cuenta**, no solo el total. |

Tests del motor: `calibration.test.ts` (§8 completo), `rules.test.ts` (regla por
regla), `robustness.test.ts` (casos adversariales de datos reales),
`regression.test.ts` (13 productos de góndola), `cleaning.test.ts` (§6),
`ledger.test.ts`, `seals.test.ts`, `presentation.test.ts`.

---

## 2. Contradicciones del documento y cómo se resolvieron

Las anoto porque tres de ellas requieren que decidas vos si la resolución que elegí es la que querías.

### 2.1 — El +5 contra la fila de calibración (te toca decidir)

§8 anota `"agua, sal, trazas de ac. parcialmente hidrogenado" → 75`. Pero §2 Paso 3 dice: *"No hay marcadores y el puntaje va ≥70 → +5"*. Con 75 sin restas, la regla da **80**.

Implementé la regla, no la celda, y el test lo fija en 80 con un comentario que apunta acá.

**Por qué importa:** con el corte de Excelente en 75, ese +5 empuja a "Lo recomendamos" a cualquier producto sin marcadores que sobreviva sus restas. Hoy eso le pasa a la leche entera (80) y a "agua, sal". Los dos son defendibles, pero es una perilla sensible.

Tres salidas, elegí una:
- **Dejarlo como está** (regla literal). Es lo implementado.
- **Subir el umbral del bonus** de 70 a, digamos, 73, para que solo lo reciban productos que ya casi no restaron.
- **Sacar el +5** y que 75 sea el techo de la cuenta compuesta. Las anclas ya cubren lo que merece más de 75.

### 2.2 — "1 o 2 ingredientes" vs. la tabla de anclas (resuelto)

§2 Paso 1 condiciona el ancla a productos de 1-2 ingredientes, pero §3 lista filas que se describen por composiciones de 3 a 5: *queso simple (leche + sal + fermentos/cuajo)*, *pan de masa madre (harina, agua, sal, masa madre)*, *pasta seca*, *conservas al natural*. Con el tope literal, esas filas serían inalcanzables.

**Resuelto:** el tope es por fila (`maxIngredients`), no global. La regla que sí se respeta al pie de la letra es la otra: *"un ancla se aplica solo si la lista completa está contenida en la fila. Un ingrediente extra invalida el ancla."*

Además varias filas se activan por composición y no por nombre — un yogur declara "leche, fermentos" y la palabra "yogur" no aparece nunca en el rotulado.

### 2.3 — El 30% de no identificados vuelve inalcanzables dos techos (resuelto)

§1.2 corta el puntaje con *"3 o más ingredientes no identificados, o más del 30% de la lista"*. Pero §2 Paso 4 define techo 74 para **1** no identificado y techo 49 para **2**. Con la regla literal, una lista de 3 ingredientes con uno solo opaco es 33% → sin datos, y esos techos nunca se usan.

**Resuelto:** el criterio porcentual se aplica desde 2 no identificados para arriba. Un producto con un único término opaco tiene techo, no ausencia de dato.

### 2.4 — El techo de 74 por "1 no identificado" igual no llega a morder (informativo)

Con base 75 y −8 por no identificado, un producto con un término opaco no puede pasar de 67. El techo se registra y se muestra como límite declarado, pero nunca recorta nada. No es un bug; es que los dos números del documento no se cruzan. Si alguna vez sube la base o baja el costo del no identificado, empieza a servir.

### 2.5 — Los azúcares tradicionales (marcado como pendiente en el documento)

§4.2 los deja con "doble tratamiento" y el pie del documento los lista como pendientes de definición. **Implementado tal cual está escrito:** ancla si el producto ES el azúcar tradicional (miel sola → 82), impacto **Alto** si aparece como ingrediente añadido a un producto manufacturado (avena + miel + canela → la miel resta 13 si está entre los tres primeros).

Consecuencia concreta: una barrita "endulzada solo con miel" puntúa igual que una endulzada con azúcar refinada. Es lo que dice el documento —*"Fitogenix evalúa la función del ingrediente en la formulación, no su prestigio"*— pero es la decisión más contraintuitiva del sistema para un usuario, y conviene que la copy la explique.

### 2.6 — Ancla de pasta seca sobre el corte de banda (informativo)

El rango de §3 es 70-80; el punto medio determinista es **75**, exactamente el corte Bueno/Excelente. Los fideos secos salen "Excelente / Lo recomendamos". Si no es lo buscado, la corrección es mover el rango en el documento (p. ej. 68-78 → 73), no tocar el motor.

---

## 3. Calibración con productos reales

Corrida sobre 22 productos típicos de góndola argentina. Ninguno de estos números viene de un test escrito para que pase: salen del motor.

| Producto | v2.1 | Por qué |
|---|---|---|
| Huevos frescos | 95 | Ancla fruta/verdura/huevo |
| Aceite de oliva extra virgen | 92 | Ancla |
| Atún al natural | 89 | Ancla carne/pescado |
| Yogur natural (leche + fermentos) | 86 | Ancla por composición |
| Manteca | 84 | Ancla; los sellos de grasa no aplican a alimento entero |
| Avena integral | 82 | Ancla cereal integral |
| Queso cremoso | 82 | Ancla queso simple |
| Leche entera | 80 | 75 + 5 (sin marcadores) — ver 2.1 |
| Fideos secos | 75 | Ancla pasta seca — ver 2.6 |
| Arroz blanco | 67 | Ancla negativa |
| Jamón cocido con ascorbato | 49 | Techo 49 (§5.2) |
| Papas fritas de paquete | 48 | Aceite de semilla 2º + 3 sellos |
| Coca-Cola Zero | 47 | Colorante, acidulante, 2 edulcorantes sintéticos |
| Mayonesa | 38 | Aceite de girasol 1º |
| Agua saborizada | 28 | Concentrado de jugo + azúcar + sucralosa |
| Barrita de cereal | 23 | Jarabe de glucosa y azúcar en posiciones 2 y 3 |
| Pan lactal blanco | 20 | Harina refinada + azúcar + aceite vegetal |
| Salchichas | 14 | Anulación por curado sin ascorbato |
| Coca-Cola | 13 | Ancla negativa bebida azucarada |
| Galletitas tipo Oreo | 12 | −39 en las tres primeras posiciones |
| Alfajor de chocolate | 6 | Ídem + 2 marcadores + sellos |
| Cerveza / vino | — | Fuera de alcance |

**Lo que hay que mirar antes de publicar:**

1. **El pan lactal blanco en Malo (20).** Es la postura de la marca aplicada con consistencia: harina 000 + azúcar + aceite vegetal sin especificar en las primeras cuatro posiciones. Pero es el producto que más gente tiene en la heladera, y "No lo recomendamos" sobre un pan de molde va a generar la conversación más difícil que tenga la app. No es un error del motor; es una decisión de comunicación.
2. **La banda Malo se está llenando.** De 22 productos, 6 caen en 0-24 y solo 1 en Bueno. §9 pide vigilar exactamente esto ("si más del 40% cae en una sola banda, hay que mover los cortes"). Con 22 productos no es estadística — hay que correrlo sobre el catálogo real.
3. **Van a subir los "sin datos suficientes".** La regla de los 3 no identificados es estricta a propósito y las listas de OFF vienen sucias. Es más honesto que inventar un número, pero se ve como catálogo incompleto.

**Cómo medirlo:** `npm run audit:scores` ya trae las reglas adaptadas y acumula la cola de curaduría (§9, punto 2). Cada término no identificado, con su frecuencia, es la lista de trabajo para hacer crecer la tabla.

---

## 4. Qué queda pendiente

1. **Recomputar la caché.** `ENGINE_VERSION` pasó a `ftg-rubric-v2.1`. Guardamos crudos y recomputamos al leer, así que no hay migración de datos — pero los puntajes servidos van a cambiar de golpe para todo el catálogo.
2. **Probar la app contra el servidor levantado.** La migración del cliente está hecha (consume `POST /products/lookup` y se borró su copia del motor), pero se verificó de forma estática: tipos, lint y grep. Falta un request real.
3. **Aplicar `migrations/011_score_nullable.sql`** antes de deployar, para que `products.score` acepte `null`. Si ya era nullable es no-op.
4. **Ampliar la tabla con la cola de curaduría** después de la primera corrida sobre el catálogo.

---

*Motor Fitogenix v2.1 — 6 coeficientes · 3 niveles de impacto · 1 mecanismo de techo · 6 anulaciones*
