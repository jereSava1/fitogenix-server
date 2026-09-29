# Deuda técnica registrada

> Temas identificados durante la auditoría que **se decidió tratar más adelante**. No entran en el plan de limpieza (Fase 5) salvo como dependencia. Cada ítem dice por qué se difiere y qué lo destraba.

| ID | Tema | Origen | Por qué se difiere | Qué lo destraba | Bloquea |
|---|---|---|---|---|---|
| DT-01 | **Saneamiento del catálogo y migración a una tabla de productos limpia** (discrepancias y faltantes resueltos y validados) | D-42 | Tarea compleja: se dedica una sesión entera aparte | Sesión propia | DT-02, DT-03, DT-04 |
| DT-02 | **Cobertura de puntaje ≥ 95%** de los productos del catálogo | D-12, D-19 | Hay que medirla después de limpiar los datos (hoy ~28,7% sin puntaje según la última corrida conocida de `score-histogram.ts`) | DT-01 | Publicación en tiendas |
| DT-03 | **Contenido neto y nutrición por envase** (RF-063) | D-37, D-43 | El dato existe en ~5% del catálogo (OFF) y hasta ~16% en el nombre del producto | DT-01 | — |
| DT-04 | **Hosting propio de imágenes, servidas por HTTPS** | D-49 (pedido del 2026-09-28) | Hoy la app carga las imágenes directo de los hosts de VTEX y Open Food Facts; alcanza para avanzar | Decidir el servicio; se puede hacer junto con DT-01 | — |
| DT-05 | **Analítica de la app** (RF-047): destino de los eventos del cliente y tasa de "fuera de catálogo" | D-60 (L-09) | La app no está publicada: no hay uso real que medir. Meterlo ahora suma un endpoint y una tabla antes del contrato v1 (etapa 5) | Contrato v1 (K-03) hecho; se implementa en la etapa 9, **antes de L-07** | RNF-U04, RNF-P03 (medición) |

---

## DT-04 · Hosting propio de imágenes

### Situación después de D-49

La app muestra la `imageUrl` tal como viene de VTEX (Carrefour, Vea, Disco, Jumbo) u Open Food Facts. Riesgos que quedan:

1. **HTTPS:** iOS bloquea por default las imágenes sin HTTPS (App Transport Security). La consulta 8 de [`sql/fase3-schema-real.sql`](sql/fase3-schema-real.sql) mide cuántas `image_url` son `http://`.
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

## DT-05 · Analítica de la app

### Situación

Native ya emite eventos (`analytics/index.ts · track`, `trackScanFailed` → `scan_failed {query, queryKind, reason, source}`), pero `setAnalyticsSink` nunca se llama: se descartan (RF-047). Por eso RNF-U04 (tasa de "fuera de catálogo") y RNF-P03 (p95 de punta a punta) no se pueden medir.

### Decisión (D-60)

| Tema | Decisión | Por qué |
|---|---|---|
| Cuándo | Etapa 9, antes de L-07 | Sin usuarios reales no hay nada que medir; la política de privacidad tiene que declarar lo que se recolecta |
| Destino de los eventos del cliente | **Endpoint propio `POST /v1/events`** en el server | Coherente con ADR-0010 (la app solo conoce la URL del server); reusa rate limit, logs y validación del contrato |
| SDK de terceros en la app (PostHog, Firebase, Amplitude, Mixpanel) | **No** | Otro dominio al que el teléfono le manda datos (con su IP), otra política de privacidad que declarar, y cerca de datos de salud (RNF-S10) |
| "Fuera de catálogo" (RNF-U04) | **Se mide en el server**: cada 404 de `POST /v1/products/lookup` ya es un escaneo fallido por catálogo | No depende del cliente ni de este endpoint; se puede sacar de los logs junto con L-08. Requiere H-01: hoy una caída de la base también responde 404 |
| PostHog | Solo como destino **server-side** posible, si el volumen o los tableros lo justifican | El server reenvía; la app no cambia |

### Diseño preliminar (a validar al implementarlo)

1. `POST /v1/events` acepta un lote chico (≤ 20) de eventos de una **lista cerrada** (`scan_failed`, `scan_rendered` con duración para RNF-P03, …), validada por el contrato. Sin texto libre más allá de la `query` escaneada; nunca respuestas del onboarding ni datos de salud.
2. Anónimo o con sesión (el `user_id` sale del token, nunca del body). Rate limit propio, como el feedback (D-21).
3. Tabla `analytics_events` (RLS activo, sin grants para `anon`), con retención acotada (por ejemplo, 90 días).
4. En native: `setAnalyticsSink` apunta a un cliente que junta eventos y los manda en lote; si falla, se descartan (la analítica nunca bloquea la UI).
