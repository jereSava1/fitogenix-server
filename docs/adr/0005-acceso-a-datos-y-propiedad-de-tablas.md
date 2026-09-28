# ADR-0005 · Propiedad de tablas y acceso a Supabase por actor

- **Estado:** Propuesto · **revisado el 2026-09-28 por ADR-0010** (el cliente ya no accede a Supabase)
- **Fecha:** 2026-09-28
- **Relacionado:** [02-arquitectura.md §7](../02-arquitectura.md), SEC-01 / D-08, RNF-S01, RNF-S03, DB-01

## Contexto

- El server accede a Supabase con una secret key (`sb_secret_…`, rol `service_role`, **saltea RLS**) desde cinco clientes creados en cinco lugares distintos.
- Native accede directo a Supabase con la anon key para Auth, `profiles` y la RPC `is_username_available`.
- **SEC-01:** la policy `"Anyone can read products"` y los grants por default permiten leer el catálogo entero con la anon key. No es intencional (D-08).
- Hay tablas sin dueño en el código (`productos_validados`, `registro_controles`, `validation_runs`) que se eliminan por etapas (DB-01).
- Varias tablas se tocan desde más de un lugar: `products` la leen el lookup, los listados y el ETL, y la escriben el ETL y (antes) el lookup.

## Decisión

### 1. Una tabla, un dueño

| Tabla / recurso | Módulo dueño | Quién más accede y cómo |
|---|---|---|
| `products`, RPC `search_products_by_name` | `catalog` | `user-library` lee **por embed** (join `products(*)`) y presenta con `catalog.productResponseFromRow`; el ETL escribe con `catalog.createProductWriter()` |
| `products_staging` | `etl` (ingestion) | Nadie más |
| `saved_products`, `scan_history` | `user-library` | Nadie más |
| `onboarding_responses` (nueva) | `account` | Nadie más |
| `feedback`, `product_reports` (nuevas) | `feedback` | Nadie más |
| `profiles` | `account` | Solo el server (`GET`/`PATCH /users/me/profile`, ADR-0010); trigger `on_auth_user_created` |
| `productos_validados`, `registro_controles`, `validation_runs` | Ninguno | Se eliminan (DB-01) |

Solo la **infraestructura del módulo dueño** consulta su tabla. La excepción controlada es el embed de `products` en los listados de `user-library`: evita N+1 consultas, y el mapeo de la fila sigue siendo del catálogo.

### 2. Acceso por actor

| Actor | Credencial | Alcance |
|---|---|---|
| Server | Secret key (`service_role`), **un solo cliente** en `platform/supabase.ts`; para Auth, llamadas sin estado (ADR-0010) | Todas las tablas de sus módulos y Supabase Auth. Como saltea RLS, **toda consulta de datos de usuario filtra por el `userId` del token** (RNF-S03), y se testea |
| ETL | Secret key propia en `etl/config.ts` | `products_staging` y `products` (vía escritor del catálogo) |
| Native | **Ninguna credencial de Supabase** (D-28, ADR-0010) | **Nada** de Supabase: solo la API del server |

### 3. Cierre del catálogo (SEC-01) y de todo acceso `anon`

Con ADR-0010, `anon` no necesita acceso a nada. Se borra la policy pública, se revocan los grants de `anon`/`authenticated` sobre `products` y `products_staging`, y `EXECUTE` de `search_products_by_name` para `anon`, `authenticated` y `PUBLIC`. Cuando native deje de usar Supabase, se revoca también lo que queda: `profiles` y `is_username_available`. Detalle y precondiciones en [00-inventario.md §7.1](../00-inventario.md). RLS queda activo en todas las tablas como segunda barrera, y toda tabla nueva nace con RLS activo y sin grants para `anon`.

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| Que el perfil y el auth sigan directo a Supabase (versión anterior de este ADR) | Descartado por D-28: el cliente pasa siempre por el server (ADR-0010) |
| Que el server use la anon key + el JWT del usuario (RLS del lado de la base) | Mejor defensa en profundidad para datos de usuario, pero obliga a un cliente Supabase por request y complica el catálogo. Queda como mejora posible para `user-library` |
| Que `user-library` pida los productos al catálogo por id (sin embed) | Una consulta extra por listado; el embed es más simple y ya funciona |

## Consecuencias

- **+** Cierra SEC-01 y deja explícito qué puede tocar cada actor.
- **+** Un solo cliente Supabase en el server (hoy son cinco, uno por request).
- **−** El filtro por `userId` es la única barrera del server para datos de usuario: se cubre con tests de caracterización de auth (paso 1 del plan).
- **−** Las tablas nuevas necesitan su migración con RLS y sin grants para `anon` (checklist en ADR-0009).
