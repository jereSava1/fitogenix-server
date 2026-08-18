# ETL — poblamiento masivo del catálogo

Código del Agente ETL (ver `fitogenix-agents/06-agente-etl-data.md` para el diseño completo — este README es solo el cómo correrlo). Vive acá, dentro de `fitogenix-server`, no en un repo aparte: reusa `RawOFFProduct`, `buildCachePayload`, `mapRawToProduct`, `enrichWithAI` y `ftgEngine` directamente, sin duplicarlos. No es parte del build de producción (`npm run build` solo compila `src/`) — corre standalone vía `tsx`, igual que los scripts existentes en `scripts/`.

```
scripts/etl/
├── adapters/       # fuente cruda → RawOFFProduct (nunca escriben nada)
│   ├── offAdapter.ts
│   └── vtexAdapter.ts
├── lib/            # normalización compartida
│   ├── supabaseAdmin.ts
│   ├── staging.ts       # products_staging: insert / fetch pending / mark
│   ├── merge.ts          # merge campo a campo por barcode
│   ├── completeness.ts   # gate: ¿alcanza para escribir a `products`?
│   └── barcode.ts        # normaliza UPC-A(12)→EAN-13, evita duplicados por formato
├── jobs/           # CLIs — lo que efectivamente se corre
│   ├── ingestOff.ts       # dump OFF → products_staging
│   ├── ingestVtex.ts      # API VTEX (Jumbo/Disco/Vea/Carrefour) → products_staging
│   ├── runMerge.ts        # products_staging → merge + gate + upsert a products
│   ├── stats.ts           # ¿qué trajimos hasta ahora?
│   ├── checkDuplicates.ts # ¿algún producto quedó guardado dos veces?
│   └── auditDataQuality.ts # ¿algún producto tiene un campo corrupto/mal mapeado?
└── run-all.sh      # orquesta TODO lo de arriba en una sola corrida (ver abajo)
```

## Correr todo de una — `npm run etl:all`

Para no tener que ir tirando comando por comando y esperando entre cada uno:

```bash
# MVP Argentina (default), sin gastar tokens de IA:
npm run etl:all

# Con un país LATAM adicional:
npm run etl:all -- --countries argentina,chile

# Incluyendo enrichment con Claude (confirmá el volumen antes — gasta tokens):
npm run etl:all -- --enrich

# Evitar que el Mac se duerma a mitad de camino (recomendado, puede tardar):
caffeinate -i npm run etl:all
```

Hace, en orden: descarga el dump de OFF si no existe ya en `/tmp/off-products.jsonl.gz` (se salta el paso si ya está — no vuelve a bajar 11GB cada vez), `etl:off`, los 4 `etl:vtex` (Carrefour/Jumbo/Disco/Vea), `etl:merge`, `etl:stats`, y `etl:check-dupes`. Un solo comando, te avisa al final. `--enrich` sigue siendo opt-in explícito (ver "Nunca" más abajo) — `etl:all` NO lo prende solo.

## Requisitos

- `.env` en la raíz de `fitogenix-server` con `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `ANTHROPIC_API_KEY` (ver `.env.example`).
- Migración `009_products_staging.sql` ya aplicada en Supabase (SQL Editor).
- `npm install` corrido en `fitogenix-server/`.
- Correr en TU máquina o un entorno con salida de red real a Supabase/Anthropic/los sitios de retail — no dentro de un sandbox restringido.

## Orden recomendado (primera corrida, validación chica)

```bash
# 1. Ingesta OFF — necesitás el dump descargado antes (es de varios GB):
curl -L -o /tmp/off-products.jsonl.gz https://static.openfoodfacts.org/data/openfoodfacts-products.jsonl.gz
npm run etl:off -- --file /tmp/off-products.jsonl.gz --limit 500   # subconjunto chico primero
# Sin --countries, SOLO trae Argentina (default) — no gasta el pipeline en
# productos de Chile/México/etc. que nadie va a escanear acá. Para sumar más
# países explícitamente: --countries argentina,chile,uruguay

# 2. Ingesta VTEX — Carrefour ya confirmado, arrancá por acá:
npm run etl:vtex -- --domain www.carrefour.com.ar --source carrefour --pages 3 --pageSize 50
# Cencosud (mismo motor VTEX, cambiá dominio y source):
npm run etl:vtex -- --domain www.jumbo.com.ar --source jumbo --pages 3 --pageSize 50
npm run etl:vtex -- --domain www.disco.com.ar --source disco --pages 3 --pageSize 50
npm run etl:vtex -- --domain www.vea.com.ar --source vea --pages 3 --pageSize 50

# 3. Merge — sin --enrich primero (no gasta tokens), para ver cuánto quedó completo solo con lo que trajimos:
npm run etl:merge -- --limit 200

# 4. Verificar qué pasó:
npm run etl:stats

# 5. Recién si el resultado se ve bien y el volumen de "incompletos" lo justifica,
#    correr merge de nuevo CON enrichment (confirmar antes con el Agente de Datos —
#    esto gasta tokens de Claude):
npm run etl:merge -- --limit 200 --enrich
npm run etl:stats

# 6. Chequear que ningún producto haya quedado duplicado:
npm run etl:check-dupes
```

## Duplicados

`lib/barcode.ts` normaliza todo barcode que pasa por el ETL a EAN-13 (UPC-A
de 12 dígitos → EAN-13 con un `0` adelante) ANTES de insertarlo en staging.
Con eso, el merge por barcode (Fase 3b) agrupa correctamente el mismo
producto físico aunque una fuente lo dé en un formato y otra en otro. Ojo:
esto es interno al ETL — el lookup en vivo por scan (`productLookupService.
lookupProduct`) usa el string tal cual lo manda el celular, sin normalizar
(cambiarlo es un cambio aparte, en código hot-path, que no se tocó acá).

`npm run etl:check-dupes` es el chequeo rerunnable — leé `products` y flaggea
barcode exacto repetido (no debería pasar nunca, hay UNIQUE constraint),
mismo código en EAN-13/UPC-A, y mismo product_name+brand con barcode
distinto (señal más débil, para revisar a mano). Correlo después de cada
`etl:merge` grande.

## Calidad de datos — campos corruptos/mal mapeados

Distinto de "falta el dato" (eso lo cubre el gate de completitud): acá el
dato ESTÁ, pero en el campo equivocado o con contenido que no es lo que dice
ser. Dos casos conocidos:

1. `ingredients_text` con texto de dirección/fábrica en vez de una lista de
   ingredientes real — típico de carga comunitaria en OFF (alguien pega la
   etiqueta completa, no solo los ingredientes).
2. `brand` vacío con la marca embebida en `product_name` — típico de scrapes
   de retailer sin ese campo tageado estructuralmente.

`npm run etl:audit-quality` es el chequeo — **solo lectura, no corrige
nada**. Heurísticas baratas y determinísticas (regex, sin gastar un token de
IA): patrones de dirección/boilerplate legal para (1), diccionario de marcas
conocidas (construido desde la propia tabla) contra `product_name` para (2),
y rango físico plausible para nutrientes (atrapa errores de unidad, mg vs g).

Reporta una muestra por categoría para revisar A MANO. `lib/qualityHeuristics.ts`
filtra el diccionario de marcas conocidas exigiendo >=2 apariciones — la
columna `brand` tiene sus propios datos corruptos (es justo lo que
auditamos), así que un valor que aparece una sola vez puede ser basura (ej.
un sabor cargado como marca por error) y contaminar el diccionario.

### Corrección — `npm run etl:fix-quality`

```bash
# Dry run — propone correcciones, NO escribe nada (pero SÍ llama a Claude,
# el costo en tokens es el mismo con o sin --apply):
npm run etl:fix-quality -- --limit 200

# Recién si el dry-run se ve bien, aplicar de verdad:
npm run etl:fix-quality -- --limit 200 --apply
```

Requiere `migrations/010_manufacturer_info.sql` aplicada antes de correr con
`--apply` (agrega una columna nueva, nullable, para no perder info de
fabricante — ver abajo).

Nunca reescribe un campo con un dato INVENTADO — Claude (`lib/qualityAI.ts`,
Haiku, separado de `claudeService.ts` que es hot-path del scan en vivo) se
usa solo para CLASIFICAR y EXTRAER texto que ya está en la fila:

- **brand vacío**: primero el diccionario determinístico (gratis). Si la
  marca nunca apareció antes en la tabla (típico de un producto con un solo
  SKU), recién ahí Claude la extrae DEL TEXTO del nombre — nunca la inventa,
  devuelve null si no hay nada identificable con confianza.
- **ingredients_text sospechoso**: Claude separa, del mismo texto, la
  porción real de ingredientes de la de fabricante/dirección/RNE-RNPA. La
  real queda en `ingredients_text`; la de fabricante se MUEVE a
  `manufacturer_info` en vez de perderse. Si no hay nada rescatable,
  `ingredients_text` se anula — la fila vuelve a pasar por el gate de
  completitud + `runMerge.ts` que ya existe (se re-busca un dato real antes
  de recurrir a `--enrich`), nunca queda con un valor inventado.

## Verificar sin correr nada (directo en el SQL Editor de Supabase)

```sql
-- qué hay pendiente / mergeado / descartado, por fuente
select source, merge_status, count(*) from products_staging group by 1, 2 order by 1, 2;

-- cuántos productos reales hay ahora
select count(*) from products;

-- los últimos que se escribieron
select barcode, product_name, brand, score, data_source, engine_version
from products order by updated_at desc limit 10;
```

## Nunca

- Correr `etl:merge -- --enrich` sin límite y sin haber confirmado presupuesto con el Agente de Datos (`05-agente-datos.md`) — gasta tokens de Claude en lote.
- Subir el `.env` a git (ya está en `.gitignore`, verificado).
- Escalar `--pages`/`--limit` a valores grandes antes de revisar los resultados del subconjunto chico.
