# B-01 · Columnas sin uso de `products`

Ítem B-01 de [`05-plan.md`](../../05-plan.md) · D-35, D-36, D-41, DB-02, D-88. Se hace en dos partes (D-88):

| Parte | Qué | Cuándo |
|---|---|---|
| B-01a | Columnas `score`, `score_label`, `sello`, `engine_version`, `nova_group`, `name_key`, `manufacturer_info`; índices `products_engine_version_idx` y `products_barcode_unique_idx`; UNIQUE `products_name_key_key` | Ahora: migración `20260930204540_products_sin_columnas_sin_uso` |
| B-01b | Las 5 filas `data_source = 'ai'` | Con el `DROP` de B-04 (desde el 2026-10-14): borrar un producto consulta las tablas de validación por sus FK y movería los contadores de B-04 |

## B-01a (lo corre el responsable, desde `~/fitogenix-server` con `git pull`)

El código ya no lee ni escribe esas columnas (ETL, scripts y server). `main`, que sigue en producción, lee `products` con `select('*')` y no las escribe. El ETL no se corre hasta terminar B-01.

```bash
supabase db push
supabase migration list --linked
```

Comprobación (SQL Editor): tienen que quedar 13 columnas, sin ninguna de las borradas.

```sql
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'products'
order by ordinal_position;
```

Y un lookup por barcode y otro por nombre desde la app o con `curl` al server.

## B-01b · Antes de borrar las filas `ai` (se puede correr ahora)

No lee las tablas de validación: no mueve los contadores de B-04.

```sql
select p.id, p.product_name,
  (select count(*) from saved_products s where s.product_id = p.id) as guardados,
  (select count(*) from scan_history h where h.product_id = p.id) as historial,
  (select count(*) from product_reports r where r.product_id = p.id) as reportes
from products p where p.data_source = 'ai';
```

Guardados, historial y reportes se borran en cascada con el producto.

## Probado en local (2026-09-30)

Supabase local con todas las migraciones: `products` queda con 13 columnas y los índices `products_pkey`, `products_barcode_key`, `products_data_source_idx`, `products_missing_ingredients_idx` y `products_name_trgm_idx`. `buildCachePayload` + `upsert` por barcode (como el ETL) inserta y actualiza sin errores; el server compilado responde el lookup por barcode y por nombre (RPC `search_products_by_name`) con el puntaje calculado al leer.
