-- 015 · El comentario de `products.sello` transcribía los cortes, y quedó mintiendo
--
-- El COMMENT de la 013 decía los umbrales con números. Dos problemas, y el segundo es
-- el grave:
--
--   1. `CONTEXT.md §3.1` dice que los umbrales viven en UN archivo del motor y se citan
--      por puntero. Un COMMENT con números es una copia más — y la peor de todas,
--      porque vive en la metadata de Postgres, donde ningún test la alcanza y ningún
--      barrido de repo la ve una vez aplicada.
--   2. ADR-007 (19/9/2026) movió el corte de abajo. Desde ese momento la base afirma un
--      umbral que el motor ya no usa.
--
-- Este cambio no toca datos ni estructura: reemplaza el texto del comentario por el
-- puntero a la fuente. Idempotente y reversible (el rollback está al pie).
--
-- Aplicar con:  psql "$DATABASE_URL" -f migrations/015_sello_comment_sin_umbrales.sql
-- No requiere ventana: COMMENT ON no toma lock de tabla ni reescribe filas.

COMMENT ON COLUMN products.sello IS
  'Sello derivado del score, DENORMALIZADO para listados. Los cortes NO se escriben acá: viven en src/domain/product/scoring/constants.ts (TIERS, EXCELLENT_FROM, BAD_BELOW) y se derivan en scoring/presentation.ts -> getSello. La banda más alta lleva el sello positivo y la más baja el negativo, por definición de banda y no por coincidencia numérica (ADR-007). NULL en las bandas del medio, y también cuando no hay puntaje: sin datos no ponemos ninguno de los dos. Como toda columna denormalizada, puede estar calculada con un engine_version viejo; la fuente de verdad es el recómputo desde los crudos.';

-- ── Rollback ──────────────────────────────────────────────────────────────────
-- El texto anterior NO se copia acá: está en `013_score_nullable.sql`, en el COMMENT
-- de esta misma columna. Copiarlo sería volver a transcribir los umbrales viejos, que
-- es exactamente lo que esta migración viene a sacar — y dejaría dos copias de un
-- número equivocado en vez de una.
