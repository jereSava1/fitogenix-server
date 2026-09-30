# B-04 · Tablas de validación en tres pasos

Ítem B-04 de [`05-plan.md`](../../05-plan.md) · D-07 · [00-inventario §7.2](../../00-inventario.md). Tablas: `productos_validados`, `registro_controles`, `validation_runs`. Lo corre el responsable (D-58), desde `~/fitogenix-server` en `fitogenix/refactor-cleanup` con `git pull`.

## Paso 1 · Backup (no escribe en la base)

1. Dump solo de los datos de las tres tablas. Como la CLI no filtra por tabla, se excluyen todas las otras de `public` (fuera del repo):

   ```bash
   mkdir -p ~/fitogenix-backups
   supabase db dump --linked --data-only --use-copy -s public -x public.products,public.products_staging,public.profiles,public.saved_products,public.scan_history,public.feedback,public.product_reports,public.onboarding_responses,public.waitlist -f ~/fitogenix-backups/2026-09-30-tablas-validacion.sql
   ```

2. Filas por tabla en el archivo (tienen que aparecer **solo** estas tres):

   ```bash
   awk '/^COPY/{t=$2;n=0;next} /^\\\.$/{if(t)print t, n; t=""} t{n++}' ~/fitogenix-backups/2026-09-30-tablas-validacion.sql
   ```

3. Filas en la base (SQL Editor):

   ```sql
   select 'productos_validados' t, count(*) from productos_validados
   union all select 'registro_controles', count(*) from registro_controles
   union all select 'validation_runs', count(*) from validation_runs;
   ```

Criterio: los conteos de 2 y 3 son iguales. El DDL ya está versionado en `supabase/migrations/20260929000000_baseline.sql`.

## Paso 2 · Sin acceso durante 14 días

1. Foto de los contadores **antes** del cambio (SQL Editor, pasame el resultado):

   ```sql
   select relname, seq_scan, idx_scan, n_tup_ins, n_tup_upd, n_tup_del
   from pg_stat_user_tables
   where relname in ('productos_validados','registro_controles','validation_runs')
   order by relname;
   ```

2. Aplicar las migraciones pendientes (también sube B-02):

   ```bash
   supabase db push
   supabase migration list --linked
   ```

   `20260930202728_tablas_de_validacion_sin_acceso` quita todo permiso a `anon`, `authenticated`, `service_role` y `PUBLIC` sobre las tablas y sus secuencias. Solo queda `postgres` (dueño): el SQL Editor sigue pudiendo leerlas.

3. Comprobación (SQL Editor): debe devolver solo filas de `postgres`.

   ```sql
   select grantee, table_name from information_schema.role_table_grants
   where table_name in ('productos_validados','registro_controles','validation_runs')
   group by 1, 2 order by 2, 1;
   ```

Criterio para avanzar (desde el **2026-10-14**): ningún error de permisos reportado por ningún proceso y la misma consulta de contadores sin cambios respecto de la foto. Si algo se rompe antes, rollback:

```sql
GRANT ALL ON TABLE public.productos_validados, public.registro_controles, public.validation_runs TO service_role;
GRANT ALL ON SEQUENCE public.registro_controles_id_seq, public.validation_runs_id_seq TO service_role;
```

## Resultados

**Paso 1 (2026-09-30):** backup en `~/fitogenix-backups/2026-09-30-tablas-validacion.sql` (máquina del responsable). Archivo y base coinciden: `productos_validados` 25, `registro_controles` 1155, `validation_runs` 9.

**Foto de `pg_stat_user_tables` antes del `REVOKE` (2026-09-30)**, tomada después del backup y del conteo (los dos suman `seq_scan`):

| Tabla | seq_scan | idx_scan | n_tup_ins | n_tup_upd | n_tup_del |
|---|---|---|---|---|---|
| productos_validados | 9 | 26 | 25 | 7 | 0 |
| registro_controles | 25 | 41 | 1155 | 80 | 0 |
| validation_runs | 4 | 43 | 10 | 9 | 0 |

`validation_runs` tiene 10 inserts y 9 filas sin borrados: un insert que falló o se deshizo también cuenta. Hasta la comparación del 2026-10-14, **no consultar estas tablas** (ni desde el SQL Editor): cualquier lectura sube `seq_scan`.

## Paso 3 · DROP

Migración `DROP TABLE` de las tres (se prepara cuando se cumpla el criterio del paso 2). Consecuencia: desaparecen los FK `ON DELETE RESTRICT` hacia `products`.

## Probado en local (2026-09-30)

Supabase local con todas las migraciones: después del `REVOKE`, `service_role` recibe `42501` en las tres tablas, `products` sigue en 200 y solo `postgres` conserva permisos. El comando del paso 1 con `--local` escribe solo los `COPY` de las tres tablas y los `setval` de sus secuencias.
