# Migraciones históricas (no se ejecutan)

Las `001` a `015` se aplicaron a mano en el SQL Editor de Supabase, antes de adoptar la CLI (ADR-0009). Quedan acá como historia: explican el porqué de cada columna. **No reproducen la base real** (hay objetos creados a mano) y la CLI no las lee, porque están en una subcarpeta.

- Falta la `011`: se perdió en un renumerado (`a0560ca`).
- La `015` vino de una rama descartada y ya está aplicada en producción (D-09); es la copia textual de `docs/raw/migracion-015-aplicada-en-prod.sql`.
- Los comentarios de la `013` y la `014` citan documentos fuera de alcance (ADR-002, BITÁCORA); se dejan como estaban.

La base de verdad pasa a ser la baseline en `supabase/migrations/<timestamp>_baseline.sql` (ítem C-05 del plan).
