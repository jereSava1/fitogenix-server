# fitogenix-server

Backend Fastify de Fitogenix: recibe búsquedas de productos (barcode o nombre),
resuelve los datos contra una cascada de fuentes, aplica el scoring Fitogénico
(`ftgEngine`) y cachea el resultado para no repetir consultas costosas (IA).

## Arquitectura de lookup — cascada (waterfall)

`POST /products/lookup` → `src/services/productLookupService.ts`. El orden es
estricto y corta ni bien hay match; cada nivel tiene try/catch propio: si falla
(timeout/500) se loguea y la cascada **continúa al siguiente nivel**, nunca
crashea.

| Nivel | Fuente | Costo | Notas |
|---|---|---|---|
| 0a | Redis (Upstash) | 0 | Caché caliente. No-op limpio si faltan las env vars. |
| 0b | Supabase `products` | 0 | Caché persistente. Guarda datos **crudos** y recomputa el score al leer. |
| 1a | Open Food Facts (OFF) | 0 | Alimentos. Sin API key. |
| 1b | Open Beauty Facts (OBF) | 0 | Cosméticos. Mismo esquema que OFF. Solo lookup por barcode. |
| 2 | Edamam Food Database | cuota free | Fallback freemium. Solo por barcode. Se saltea (logueado) si faltan las keys. Free tier ≈ 10 req/min; un 429 cae limpio al nivel 3. |
| 3 | Claude (IA) | tokens | Último recurso. Único nivel que aplica a búsquedas por nombre sin match en OFF. |

Todas las fuentes se normalizan a `RawOFFProduct` (patrón Adapter, ver
`openBeautyFactsApi.ts` y `fallbackFoodApi.ts`) para que `mapOFFToProduct` +
`ftgEngine` scoreen igual sin importar el origen.

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

**Unit tests (119):** co-locados como `src/**/*.test.ts`. Cubren, entre otros:
- Cascada por barcode: hit de cache sin tocar cold path; OFF falla → OBF
  resuelve; OFF+OBF fallan → Edamam resuelve; todos fallan → Claude; OBF/Edamam
  no se consultan en búsquedas por nombre; singleflight (requests concurrentes
  comparten una resolución).
- Cache: round-trip de `buildCachePayload`/`getCachedProductByBarcode`/
  `getCachedProductByNameKey`, filas viejas sin crudos (o con `nutriments` `{}`)
  tratadas como miss, upsert awaiteado que devuelve el `id`, upgrade
  name→barcode (misma fila, id conservado), fila `name_key` con barcode null.
- Guardados e historial por `product_id` (upserts idempotentes, FK → 404,
  listados con embed + score recomputado).
- Los servicios externos se mockean con `vi.mock` (ver
  `productLookupService.test.ts` como referencia de estilo).

**Verificación end-to-end realizada (2026-07-07/08), contra servicios reales:**
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
