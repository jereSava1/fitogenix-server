# Deuda técnica registrada

> Temas que **se decidió tratar más adelante**. Cada ítem dice por qué se difiere y qué lo destraba.

| ID | Tema | Origen | Por qué se difiere | Qué lo destraba | Bloquea |
|---|---|---|---|---|---|
| DT-01 | **Saneamiento del catálogo y migración a una tabla de productos limpia** (discrepancias y faltantes resueltos y validados) | D-42 | Tarea compleja: se dedica una sesión entera aparte | Sesión propia | DT-02, DT-03, DT-04 |
| DT-02 | **Cobertura de puntaje ≥ 95%** de los productos del catálogo | D-12, D-19 | Hay que medirla después de limpiar los datos (hoy ~28,7% sin puntaje según la última corrida conocida de `score-histogram.ts`) | DT-01 | Publicación en tiendas |
| DT-03 | **Contenido neto y nutrición por envase** (RF-063) | D-37, D-43 | El dato existe en ~5% del catálogo (OFF) y hasta ~16% en el nombre del producto | DT-01 | — |
| DT-04 | **Hosting propio de imágenes, servidas por HTTPS** | D-49 (pedido del 2026-09-28) | Hoy la app carga las imágenes directo de los hosts de VTEX y Open Food Facts; alcanza para avanzar | Decidir el servicio; se puede hacer junto con DT-01 | — |
| DT-06 | **Calidad y discriminación del motor** (M-1 a M-8 de [`dominio-scoring.md` §S7](dominio-scoring.md)): puntaje sin gate de cobertura, cola de curaduría descartada, alias faltantes, frescos sin puntaje, el 75 % de los productos en una sola banda, la excepción del art. 7 por aproximación | Relevamiento de `CONTEXT.md` / `NUTRICION.md` (2026-09-29) | No es limpieza: cambia puntajes. Necesita el fundamento de OPS (M-3) y contrastar contra fuentes externas antes de tocar coeficientes | RF-062 / L-05 (refactor del motor) y DT-01 | Publicación en tiendas (un puntaje que no discrimina no cumple su función) |
| DT-05 | **Destino de la analítica** (RF-047, L-09): hoy los eventos `scan_failed` se descartan | D-61 | La app no está publicada: sin uso real no hay nada que medir, y construirlo ahora es trabajo sin retorno | Tener usuarios reales (beta cerrada o antes de publicar) (reusa el rate limit y el antispam del feedback) | Medir RNF-U04 (tasa de fuera de catálogo) y RNF-P03 (p95 del lado de la app) |
| DT-07 | **Avisos de `npm audit` en native sin arreglo** | CI de native (2026-10-03) | `node-forge` y `braces` (altos, los trae `@expo/cli` para compilar, no van en la app) no tienen versión arreglada; `decode-uri-component` (moderado, sí va en la app, por `expo-router`) solo tiene arreglo en ESM y no se puede forzar | Que Expo o esos paquetes publiquen un arreglo. Las excepciones están en `audit-allowlist.json` de native: el CI avisa cuando una deja de hacer falta | — |
| DT-08 | **El adaptador de VTEX guarda 2 decimales** y la fuente publica más (`9.33` contra `9.33333333`) | Ola 4 (T-12, 2026-10-09): 25 de 26 contradicciones de la muestra en vivo eran solo redondeo | Cambia el dato guardado en miles de filas y no mueve puntajes de forma relevante | Una pasada de relectura de Cencosud con `etl:fidelity` | — |
| DT-09 | **Los jobs de purga con I/O no tienen prueba unitaria** (`purgeProducts`, `fixBarcodes`, `mergeDuplicateCodes`, `retireCodes`, `fidelity`, `sourceReread`, `productsExport`): solo sus funciones puras | Purga de 2026-10-09 | Hablan con Supabase y con las fuentes; se probaron con simulación y relectura sobre la base real | Un cliente de Supabase inyectable o una base local en el CI | — |

---

## DT-04 · Hosting propio de imágenes

### Situación después de D-49

La app muestra la `imageUrl` tal como viene de VTEX (Carrefour, Vea, Disco, Jumbo) u Open Food Facts. Riesgos que quedan:

1. **HTTPS:** iOS bloquea por default las imágenes sin HTTPS (App Transport Security). Falta medir cuántas `image_url` son `http://`.
2. **Dependencia de terceros:** si un supermercado cambia, borra o bloquea sus URLs (hotlinking), la imagen desaparece de la app sin aviso.
3. **Sin control del tamaño:** se descargan imágenes en la resolución que publique cada fuente, aunque la app las muestre chicas.
4. **Privacidad:** cada imagen que carga la app es una request del teléfono del usuario a un tercero (con su IP).

### Idea

Copiar las imágenes a un **servicio externo de almacenamiento y CDN**, que las sirva **siempre por HTTPS**, en tamaños adecuados para la app, y guardar en `products` la URL propia.

### Opciones a evaluar

| Servicio | Tipo | A considerar |
|---|---|---|
| Cloudflare R2 + Cloudflare Images | Almacenamiento + CDN + redimensionado | Sin costo de salida (egress); redimensionado por URL |
| Cloudinary / ImageKit | Servicio de imágenes administrado | Transformaciones por URL (tamaño, formato WebP/AVIF); plan gratuito limitado |
| AWS S3 + CloudFront | Almacenamiento + CDN | Más configuración; costo de salida |
| Bunny Storage + CDN | Almacenamiento + CDN | Barato y simple |
| ~~Supabase Storage directo~~ | — | Contradice D-28 (la app no hace requests directas a Supabase), salvo que se sirva detrás de un CDN o del server |

### Diseño preliminar (a validar)

1. **El ETL copia cada imagen una sola vez** al servicio elegido (al ingresar o enriquecer el producto) y guarda la URL propia en `products` (conservando la URL de origen para re-procesar).
2. **La app solo carga imágenes del dominio propio**, por HTTPS.
3. **Tamaños:** una variante para listas (miniatura) y otra para el detalle.
4. **Derechos de uso:** verificar las condiciones de uso de las imágenes de cada fuente antes de copiarlas (Open Food Facts publica con licencia abierta con atribución; las de los supermercados hay que revisarlas).

### Criterio para priorizarlo

Pasa a prioridad alta si la consulta 8 muestra muchas imágenes `http://`, o si en pruebas con la app aparecen imágenes rotas por cambios en los hosts de origen.

---

## DT-05 · Destino de la analítica

### Situación

native ya emite `scan_failed {query, queryKind, reason, source, scannedAt}` desde `useScanFlow` y `useProductSearch`, a través de un módulo único (`src/analytics/index.ts · track, trackScanFailed`) que respeta el consentimiento (`setAnalyticsEnabled(false)` lo vuelve no-op). Falta el destino: `setAnalyticsSink` nunca se llama, así que los eventos se descartan.

### Decisión (D-61)

Se difiere. Cuando se retome, el destino es un **endpoint propio del server**, no un SDK de terceros:

| Opción | Por qué sí / por qué no |
|---|---|
| **Endpoint propio `POST /v1/events`** (elegida como rumbo) | La app sigue hablando solo con el server (D-28, ADR-0010); los datos quedan en nuestra base; sin claves de terceros en el bundle. Costo: el tablero son consultas SQL, sin embudos ni retención listos |
| PostHog / Firebase / Amplitude / Mixpanel | Tableros listos, pero suman un destino externo y una clave en la app, y mandan datos del usuario a un tercero (revisar con la política de privacidad, L-07). Se reconsidera solo si hacen falta embudos o retención que no convenga armar a mano |

### Diseño preliminar (a validar cuando se retome)

1. **native:** un sink que junta eventos en memoria y los manda en lote a `POST /v1/events` (cada N eventos o al pasar la app a segundo plano); si falla, se descartan (la analítica nunca rompe un flujo). Sin consentimiento no se manda nada (ya es la regla del módulo).
2. **server:** acepta anónimos y usuarios, como el feedback (D-21): rate limit propio y antispam, lote con tamaño máximo, validación estricta del evento. El `user_id` sale del token, nunca del body.
3. **base:** tabla `analytics_events` con RLS activo y sin grants para `anon` (checklist del ADR-0009), retención acotada (por ejemplo 90 días).
4. **tablero:** consultas SQL (o vistas) para RNF-U04: tasa semanal de `scan_failed{reason:out_of_catalog}` sobre el total de escaneos. Para el total hace falta emitir también `scan_completed` (el tipo ya existe en `analytics-events.ts`).

### Mientras tanto

La tasa de "fuera de catálogo" se puede aproximar del lado del server sin tocar la app: cada `404` de `POST /products/lookup` es un producto que no está en el catálogo. Si hace falta antes, se agrega a la medición desde logs de L-08. Los errores de red, en cambio, solo los ve la app.
