# ADR-0009 · Un solo mecanismo de migraciones + baseline

- **Estado:** Aceptado · implementado
- **Fecha:** 2026-09-28
- **Relacionado:** D-09, D-81, ADR-0005

## Contexto

- `migrations/` tiene `001`–`014` (sin `011`, por el renumerado de `a0560ca`), aplicadas **a mano** en el SQL Editor.
- `supabase_migrations.schema_migrations` tiene **una sola** entrada (`20260923014352 validation_tables_v1`), aplicada con la CLI o el MCP de Supabase, **sin archivo en el repo**.
- En producción hay objetos que ningún archivo crea: `profiles` (+ índice + policies), `handle_new_user()` + trigger `on_auth_user_created`, la policy `"Anyone can read products"`, el índice duplicado `products_barcode_unique_idx`, y el COMMENT de la `015` (D-09).
- Conclusión: hoy **no se puede reconstruir la base desde el repo**, ni saber qué está aplicado.

## Decisión

1. **Mecanismo único: migraciones de la CLI de Supabase** en `supabase/migrations/<timestamp>_<nombre>.sql`, registradas en `schema_migrations`. Se aplican con `supabase db push` (o desde CI), nunca pegando SQL en el editor.
2. **Baseline:** una migración inicial que refleja el schema de producción **tal como está hoy** (generada con `supabase db dump --schema-only` y revisada), marcada como aplicada con `supabase migration repair` para no ejecutarla sobre producción. Incluye los objetos creados a mano y la `015`.
3. Las `001`–`014` se mueven a `supabase/migrations/legacy/` como historia (no se ejecutan): documentan el porqué de cada columna.
4. Primeras migraciones después del baseline, en este orden (cada una en su PR): cierre del catálogo (SEC-01), eliminación del índice duplicado, corrección de `handle_new_user` para guardar `phone` (D-17), tablas nuevas (`onboarding_responses`, `feedback`, `product_reports`), y la eliminación por etapas de las tablas de validación (DB-01).
5. **Checklist de toda migración nueva:** RLS activo; sin grants para `anon` salvo que se justifique; policies explícitas; `COMMENT` sin citar documentos fuera del repo; rollback escrito en el mismo archivo.

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| Seguir con archivos numerados aplicados a mano | Es lo que llevó a no saber qué está aplicado |
| Herramienta genérica (dbmate, Flyway, node-pg-migrate) | Funciona, pero Supabase ya trae su CLI y su tabla de registro, y una migración ya se aplicó así |
| Prisma o Drizzle con migraciones generadas | Agrega un ORM que el código no usa (hoy usa `supabase-js` y RPCs) |

## Consecuencias

- **+** La base se puede reconstruir desde el repo (entornos de prueba, CI) y se sabe qué está aplicado.
- **−** Requiere instalar la CLI de Supabase y tener acceso al proyecto para generar el baseline (**esta máquina no la tiene**).
- **−** El baseline es un archivo grande que hay que revisar con cuidado: se contrastó con el schema relevado de producción.
