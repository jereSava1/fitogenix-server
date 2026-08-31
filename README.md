# fitogenix-server

Backend Fastify de Fitogenix: recibe búsquedas de productos (barcode o nombre),
resuelve los datos **contra el catálogo propio**, aplica el scoring Fitogénico
(`ftgEngine`) y cachea el resultado.

## Arquitectura de lookup — catalog-only

> **Corregido el 2026-08-28.** Este README describía una cascada en vivo
> `OFF → OBF → Edamam → Claude` como la arquitectura del lookup. Se retiró del
> camino de request el **2026-08-18** (decisión de producto, ver ADR-002 nota
> "parte 2" en `fitogenix-agents/BITACORA_DECISIONES.md`), y el README no se
> actualizó. La tabla de niveles 1a/1b/2/3 que estaba acá ya no describe ninguna
> ruta de código.

`POST /products/lookup` → `src/services/productLookupService.ts`. Es un camino
de **solo lectura**: Redis, después Supabase, y si el producto no está en el
catálogo, `lookupProduct` devuelve `null` y la ruta responde que todavía no lo
tenemos. **No hay fallback a proveedores externos ni a IA durante la request.**

| Nivel | Fuente | Costo | Notas |
|---|---|---|---|
| 0a | Redis (Upstash) | 0 | Caché caliente. No-op limpio si faltan las env vars. |
| 0b | Supabase `products` | 0 | Caché persistente **y catálogo**. Guarda datos **crudos** y recomputa el score al leer. Por nombre resuelve con el índice trigram de la migración 014. |
| — | *(sin nivel 1+)* | — | Miss = `null`. El catálogo crece por el ETL, no por el tráfico de búsqueda. |

Por qué: la cascada agregaba varios round-trips de red secuenciales —era la
causa principal de que una búsqueda en frío tardara segundos— y duplicaba
trabajo que el ETL ya hace en batch, con curaduría y sin una request HTTP
esperando. El docstring de `productLookupService.ts` lo explica en detalle.

`offService.ts`, `openBeautyFactsApi.ts`, `fallbackFoodApi.ts` y
`claudeService.ts` **siguen existiendo y siguen manteniéndose**: hoy los invoca
el pipeline de `scripts/etl/` en batch. Todas las fuentes se normalizan a
`RawOFFProduct` (patrón Adapter) para que `mapRawToProduct` + `ftgEngine`
scoreen igual sin importar el origen.

**Consecuencia operativa:** si el ETL no pobló el catálogo, el usuario no tiene
resultado. El poblamiento dejó de ser una optimización de costo y pasó a ser
condición de que el producto funcione.

## Caché (Supabase) — identidad por `products.id`

- **Identidad** (migración 006): `products.id` (uuid). Viaja como `productId`
  en el payload del lookup y es lo que referencian
  `saved_products.product_id` y `scan_history.product_id` (el cliente
  guarda/quita favoritos por `productId`). `cache_key` ya no existe.
- **Atributos de búsqueda** (ambos UNIQUE nullable):
  - `barcode` → upsert `onConflict:'barcode'` para productos con código.
  - `name_key` → upsert `onConflict:'name_key'` para productos resueltos
    **solo por IA**: el query normalizado (minúsculas, sin acentos, espacios
    colapsados) **sin prefijo**, con `barcode = null`. OJO semántica:
    `name_key` guarda el **query** que originó la fila, no el nombre del
    producto (la fila con `name_key='lays'` puede tener
    `product_name='Papas Fritas Clásicas'`). La segunda búsqueda idéntica se
    sirve del cache **sin gastar IA**.
- **Upgrade name→barcode**: si un producto entró por nombre (fila sin barcode)
  y después se escanea por barcode, `setCachedProduct` **actualiza esa misma
  fila** (id conservado, `name_key` queda como alias) en vez de duplicarla —
  los guardados e historial existentes sobreviven.
- El upsert al cache ahora se **awaitea** y devuelve el `id` (el payload
  necesita `productId`); Redis sigue fire-and-forget. Las claves INTERNAS de
  Redis/in-flight/logs siguen siendo el barcode o `'name:<query>'` — son
  claves de proceso, no identidad.
- Se guardan los CRUDOS (`ingredients_text`, `nutriments`, `nova_group`,
  `additives_tags`) + denormalizados para listados. El score se **recomputa al
  leer** (puede cambiar entre versiones del motor — columna `engine_version`).
  Un `nutriments` vacío (`{}`) cuenta como AUSENTE: fila sin ingredientes ni
  nutrientes reales = cache miss.
- Unicidad: `UNIQUE(barcode)` y `UNIQUE(name_key)`. `product_name` **no** es
  único (ver migración 003 — un índice único ahí rompía el cacheo en silencio).

⚠️ Los errores de upsert al cache **solo se loguean** (el lookup ya respondió).
Si el cacheo "no guarda", buscar `[cacheService] setCachedProduct upsert error`
en los logs: históricamente los fallos fueron de esquema (columna faltante,
índice único inesperado) y pasaron desapercibidos por esto.

## Migraciones (`migrations/`)

Se aplican a mano en el SQL Editor de Supabase (el service-role key vía
PostgREST no ejecuta DDL). En orden:

1. `001_product_cache.sql` — columnas crudas + `UNIQUE(barcode)`.
2. `002_cache_key.sql` — `cache_key` + backfill + `UNIQUE(cache_key)`.
3. `003_drop_product_name_unique.sql` — elimina el índice único sobre
   `product_name` que bloqueaba nombres repetidos.
4. `004_saved_products.sql` — tabla de guardados por usuario + RLS.
5. `005_scan_history.sql` — historial de escaneos por usuario + RLS.
6. `006_product_identity.sql` — identidad por `products.id`: agrega
   `name_key`, migra `saved_products`/`scan_history` a `product_id` (FK a
   `products.id`) y **elimina `cache_key`** de las tres tablas.

## Observabilidad

Cada lookup emite una línea JSON:

```json
{"event":"product_lookup","cacheKey":"7622210449283","source":"supabase","dataSource":"off"}
```

- `cacheKey` = la clave **interna** de proceso (barcode o `'name:<query>'`),
  no la identidad del producto (esa es `products.id` / `productId`).
- `source` = **nivel que sirvió esta request** (`redis`/`supabase` = cache;
  `catalog` = match por nombre en nuestro propio catálogo;
  `off`/`obf`/`edamam`/`ai` = fuente en vivo).
- `dataSource` = **proveedor original del dato**, preservado a través del cache.
  Permite analítica de origen aunque el producto salga cacheado.

## Variables de entorno (`.env`, ver `.env.example`)

| Var | Requerida | Uso |
|---|---|---|
| `ANTHROPIC_API_KEY` | sí | Nivel IA (lookup + enriquecimiento). |
| `SUPABASE_URL` / `SUPABASE_SECRET_KEY` | sí | Caché persistente + auth. |
| `SERPAPI_API_KEY` | sí | Imagen de fallback (Google Images). |
| `EDAMAM_APP_ID` / `EDAMAM_APP_KEY` | no | Nivel 2. Producto **"Food Database API"** en developer.edamam.com (las keys de Recipe/Nutrition NO sirven). Sin ellas el nivel se saltea logueado. |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | no | Nivel 0a (Redis). Sin ellas, no-op. |
| `REMOVE_BG_API_KEY` | no | `/products/image` (quitar fondo). Sin ella el endpoint devuelve 502. |

## Desarrollo y testing

```bash
npm run dev          # tsx watch src/main.ts (puerto 3000)
npx tsc --noEmit     # typecheck
npx vitest run       # unit tests
```

**Unit tests:** co-locados como `src/**/*.test.ts` (27 archivos entre `src/` y
`scripts/`; ~345 casos `it()` contados estáticamente el 28/8/2026 — el número
"119" que figuraba acá quedó viejo, y la suite no se re-corrió en esa sesión).
Cubren, entre otros:
- Lookup catalog-only: hit de Redis, hit de Supabase, y **miss = `null` sin
  cascada a ningún proveedor externo**; si el catálogo lanza, el error se
  propaga en vez de inventar un fallback; singleflight (requests concurrentes
  comparten una resolución).
- Cache: round-trip de `buildCachePayload`/`getCachedProductByBarcode`/
  `getCachedProductByNameKey`, filas viejas sin crudos (o con `nutriments` `{}`)
  tratadas como miss, upsert awaiteado que devuelve el `id`, upgrade
  name→barcode (misma fila, id conservado), fila `name_key` con barcode null.
- Guardados e historial por `product_id` (upserts idempotentes, FK → 404,
  listados con embed + score recomputado).
- Los servicios externos se mockean con `vi.mock` (ver
  `productLookupService.test.ts` como referencia de estilo).

**Verificación end-to-end realizada (2026-07-07/08), contra servicios reales.**
⚠️ **Es anterior al rediseño catalog-only del 18/8:** los tres puntos siguientes
verificaron la cascada en vivo, que ya no existe en el request path. Se
conservan como registro histórico de que esos adapters funcionan contra los
servicios reales —lo que hoy le importa al ETL, que es quien los usa— no como
descripción del comportamiento actual del endpoint.
- Supabase: write→read→recompute por barcode y por `name:` verificado con
  scripts efímeros; hits confirmados desde la UI (`source:"supabase"`, ~3.5x
  más rápido que el cold path).
- OBF por la cascada real: barcode `8410757001090` con OFF caído →
  `{"source":"obf","dataSource":"obf"}`, persistido con `data_source='obf'`.
  De paso validó la resiliencia (fallo de OFF no crashea, degrada).
- Edamam: keys validadas en vivo (`049000006346` → 200, "Coca-Cola Can",
  adapter normalizó 10 nutrientes). El ruteo OFF-miss→OBF-miss→Edamam queda
  cubierto por unit test (encontrar un barcode ausente de OFF+OBF en vivo
  quema cuota del free tier sin agregar señal).

Patrón para futuros checks de infraestructura: script efímero en `scripts/`
con `tsx`, sembrar datos sintéticos (barcode `000000000000x`), verificar, y
**borrar la fila y el script** al terminar.

## Rutas

- `POST /products/lookup` `{ query }` — lookup principal (devuelve `productId`).
  Anónimo permitido; con Bearer token registra el escaneo en el historial.
- `GET /products/image?url=` — proxy de imagen con remove.bg (502 sin key).
- `DELETE /users/me` — borra la cuenta (requiere JWT de Supabase).
- `GET /users/me/saved` / `POST /users/me/saved` `{ productId }` /
  `DELETE /users/me/saved/:productId` — guardados por usuario (JWT; `productId`
  = uuid de `products`).
- `GET /users/me/history?limit=` — historial de escaneos (JWT).
