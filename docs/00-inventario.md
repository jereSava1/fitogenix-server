# Fase 0 — Inventario

> Fecha: 2026-09-28 · Base auditada: **`main`** de cada repo (lo que corre en Render).
> Regla de evidencia: archivo + símbolo. Las salidas crudas de herramientas están en [`docs/raw/`](raw/).
> Lo marcado **[PREGUNTA]** está pendiente de confirmación y no se da por cierto.

---

## 1. Estado git por repo

### 1.1 Limpieza de ramas (hecha el 2026-09-28, a pedido)

Por instrucción explícita se eliminaron todas las ramas salvo `main`, locales y remotas, en los dos repos.
Antes de borrar se generó un respaldo completo de cada repo con `git bundle --all`:

| Repo | Respaldo | Refs |
|---|---|---|
| fitogenix-server | `~/fitogenix-backups/fitogenix-server-todas-las-ramas-2026-09-28.bundle` | 20 |
| fitogenix-native | `~/fitogenix-backups/fitogenix-native-todas-las-ramas-2026-09-28.bundle` | 11 |

Trabajo que **no estaba en `main`** y solo sobrevive en el bundle:

| # | Repo | Rama borrada | Commits | Contenido relevante para la auditoría |
|---|---|---|---|---|
| 1 | server | `feat/sello-corte-40` | 4 | Scoring v2.4 (sello negativo en toda la banda baja), `flagged` derivado del motor en `productLookupService.ts`, migración `015_sello_comment_sin_umbrales.sql` |
| 2 | server | `fix/renumerado-migraciones` | 7 | Corrige rastros del renumerado de migraciones (008/012/013/014), `scripts/verify-schema.ts`, **fix de paginación en `scripts/etl/lib/staging.ts` (`fetchRowsForBarcodes`, el merge procesaba el 64%)**, CI (`.github/workflows/test.yml`), `.nvmrc` |
| 3 | native | `rescate/wip-desktop-viejo` | 1 | WIP viejo (borraba rutas `+api.ts` y el motor local; agregaba `src/lib/api.ts`) |

**Decisión (2026-09-28): se descarta todo ese trabajo.** No entra al backlog. Los bundles quedan en `~/fitogenix-backups/` solo como red de seguridad y se pueden borrar a mano cuando quieras (`git fetch <bundle> <rama>:<rama>` recupera una rama).

Ramas remotas borradas (todas con su contenido ya en `main` o equivalente por patch):
server → `agents/pre-deploy-command-for-render`, `nutricion/verificar-octogonos`;
native → `chore/expo-plugins-y-lock`, `design-testing`.

### 1.2 Estado resultante

| Repo | Rama | HEAD | Sincronizado con origin | Cambios sin commitear | Worktrees |
|---|---|---|---|---|---|
| fitogenix-server | `main` | `dae49be` merge: octogonos como insumo interno del puntaje (v2.3) | sí | no | `~/fitogenix-server` (main) + el de esta auditoría (HEAD detached en `dae49be`); se quitaron `login-error-debugging-guide` y el fantasma `/tmp/wip-check` |
| fitogenix-native | `main` | `976c015` Merge branch 'main' (último commit real: `49d4b44` "cambios UI onboarding y perfil", 2026-09-21) | sí (fast-forward de 10 commits) | no | solo el principal |

`git log --oneline -15` de server (`main`):

```
dae49be merge: octogonos como insumo interno del puntaje (v2.3)
0d58f28 feat(scoring): el octogono resta puntos y deja de nombrarse
a4d0236 chore(git): ignorar .DS_Store
bbcaa4b fix(scoring): import scoring barrel explicitly to avoid runtime resolution collision
a336d21 fix(scoring): dos reglas mas de octogonos, con el Manual de Aplicacion oficial
5a91a81 fix(scoring): corregir dos umbrales de octogonos — los dos sub-marcaban
0712f2d docs(scoring): registrar la verificacion de los octogonos contra el perfil de OPS
415577c chore(scripts): histograma de puntajes del catalogo
d73f378 docs(readme): corregir la arquitectura de lookup a catalog-only
a0428bd docs: actualizar README del ETL (mapOFFToProduct -> mapRawToProduct)
5712b36 chore(scripts): smoke test manual del RPC de búsqueda
629bc6b chore: correr build antes de start (prestart hook)
6f1ffaf feat(search): búsqueda catalog-only, sin cascada a proveedores externos
a0560ca Renumber migrations 010/011 to 012/013 (collision with 010_incomplete_products.sql)
c88c71d WIP rescatado del clon del Desktop
```

Native tiene **dos autores activos** (`jereSava`: 42 commits, `Fitogenix`: 15 commits; los últimos del 19 y 21/09).

---

## 2. fitogenix-server

### 2.1 Stack y versiones (instaladas, `docs/raw/server-npm-ls.txt`)

| Pieza | Declarada | Instalada | Rol |
|---|---|---|---|
| Node | — (sin `engines` ni `.nvmrc`) | local 22.18.0 | runtime. Render "usa la versión que indica el server", pero el server **no indica ninguna**, así que Render cae a su default (ver §2.2) |
| fastify | ^5.3.2 | 5.9.0 | HTTP |
| @fastify/cors | ^10.0.2 | 10.1.0 | CORS |
| @fastify/rate-limit | ^10.2.2 | 10.3.0 | rate limit en memoria |
| fastify-plugin | **no declarada** | 5.1.0 (transitiva) | la usa `src/plugins/auth.ts` → dependencia no listada |
| @supabase/supabase-js | ^2.108.2 | 2.110.0 | DB + Auth |
| @upstash/redis | ^1.38.0 | 1.38.0 | caché caliente (opcional) |
| @anthropic-ai/sdk | ^0.55.0 | 0.55.1 | **solo lo usa el ETL**; el runtime no lo importa |
| dotenv | ^17.4.2 | 17.4.2 | carga `.env` |
| typescript | ~6.0.3 | 6.0.3 | build (`tsc`, CommonJS, `rootDir: src`) |
| tsx | ^4.19.2 | 4.22.4 | dev + scripts/ETL |
| vitest | ^4.1.9 | 4.1.9 | tests |

Motor de scoring: `ENGINE_VERSION = 'ftg-rubric-v2.3'` (`src/domain/product/scoring/constants.ts`).

### 2.2 Entry points

| # | Entry point | Cómo se invoca | Qué es |
|---|---|---|---|
| 1 | `src/main.ts` → `dist/main.js` | `npm start` (con `prestart: npm run build`) | **Servidor HTTP deployado** |
| 2 | `scripts/etl/jobs/*.ts` (11 jobs) | `npm run etl:*` vía `tsx` | ETL de catálogo, standalone, fuera del build |
| 3 | `scripts/audit-scores.ts` | `npm run audit:scores` | auditoría del motor |
| 4 | `scripts/{add-en-aliases,capture-golden,score-histogram,test-search-rpc}.ts` | a mano (sin script npm) | utilitarios; knip los marca como no usados |
| 5 | `scripts/etl/run-all.sh` | `npm run etl:all` | orquesta el ETL |

No hay `Dockerfile`, `render.yaml` ni CI (`.github/`) en `main`. El deploy se configura en el dashboard de Render (confirmado 2026-09-28):

| Paso | Comando en Render | Observación |
|---|---|---|
| Build | `npm install && npm run build` | `npm run build` = `tsc`. `typescript` es devDependency: funciona mientras el build **no** corra con `NODE_ENV=production` (npm omitiría devDependencies) |
| Start | `node dist/main.js` | no pasa por `npm start`, así que el hook `prestart` de `package.json` **no se ejecuta en Render**: es redundante con el build |
| Node | la del server | el server no la declara (sin `engines.node` ni `.nvmrc`), así que queda la default de Render y puede cambiar sin aviso. Local y tests: 22.18.0 |
| Config versionada | ninguna | la config de deploy vive solo en el dashboard: no es reproducible desde el repo |

### 2.3 Rutas registradas en `main.ts`

| # | Método | Ruta | Plugin (archivo · símbolo) | Auth | Validación de entrada | Schema de respuesta | Consume (servicio) |
|---|---|---|---|---|---|---|---|
| 1 | GET | `/health` | `main.ts` inline | no | — | no | nada (no chequea dependencias) |
| 2 | POST | `/products/lookup` | `routes/products/lookup.ts · productLookupRoute` | opcional (si hay Bearer, registra el escaneo en background) | sí (`query` 1..200) | sí, 200/404 (`lookupSchema.ts · lookupResponseSchema`) | `productLookupService.lookupProduct`, `scanHistoryService.resolveUserIdFromToken/recordScan` |
| 3 | GET | `/products/image?url=` | `routes/products/image.ts · productImageRoute` | **no** | **no** (solo chequea que exista `url`) | no | `imageService.removeBackground` (descarga una URL arbitraria y la manda a remove.bg) |
| 4 | DELETE | `/users/me` | `routes/users/deleteMe.ts · deleteUserRoute` | sí (`requireAuth`) | — | no | Supabase `auth.admin.deleteUser` (cliente admin creado en cada request) |
| 5 | GET | `/users/me/saved` | `routes/users/saved.ts · savedProductsRoutes` | sí | — | no | `savedProductsService.listSavedProducts` |
| 6 | POST | `/users/me/saved` | idem | sí | sí (`productId` uuid) | no | `savedProductsService.saveProduct` |
| 7 | DELETE | `/users/me/saved/:productId` | idem | sí | sí (param uuid) | no | `savedProductsService.removeSavedProduct` |
| 8 | GET | `/users/me/history?limit=` | `routes/users/history.ts · scanHistoryRoutes` | sí | sí (`limit` integer, se clampa a 1..50) | no | `scanHistoryService.listScanHistory` |

Plugins globales (`main.ts`): `@fastify/cors` con `origin: true` (refleja cualquier origin) y `@fastify/rate-limit` con 60 req/min por IP en memoria (por instancia).
Auth (`plugins/auth.ts · requireAuth`): valida el Bearer con `supabase.auth.getUser(token)`, que hace un round-trip a Supabase en cada request autenticada. Se registra dentro de cada plugin de rutas, que están encapsulados (no usan `fp`), así que el hook no se filtra a las rutas públicas.

### 2.4 Variables de entorno: `config.ts` vs. `.env.example` vs. uso real

`src/config.ts` es el **único** lugar de `src/` que lee `process.env`. Los scripts del ETL importan ese mismo `config` (`scripts/etl/lib/supabaseAdmin.ts`, `scripts/etl/lib/qualityAI.ts`).

| Variable | `config.ts` | `.env.example` | La usa el runtime (alcanzable desde `main.ts`) | La usa el ETL/scripts | Observación |
|---|---|---|---|---|---|
| `PORT` | opcional (default 3000) | sí | `main.ts` | — | OK |
| `SUPABASE_URL` | **required** | sí | auth, cache, saved, history, deleteMe | sí | OK |
| `SUPABASE_SECRET_KEY` | **required** | sí | idem | sí | OK (service role; ver §2.6) |
| `ANTHROPIC_API_KEY` | **required** | sí | **no**: `claudeService` no es alcanzable desde `main.ts` | sí (`runMerge`, `qualityAI`) | Obligatoria para **arrancar** el server sin que el server la use |
| `SERPAPI_API_KEY` | **required** | sí | **no**: solo `imageService.fetchSearchImageUrl`, exportada y sin usos | no | Obligatoria para arrancar y sin ningún uso vivo |
| `REMOVE_BG_API_KEY` | opcional | sí (sin marcar opcional) | `imageService.removeBackground` | — | Sin ella, `/products/image` responde 502 |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | opcional | sí | `redisService.getRedis` | — | Sin ellas, Redis es no-op |
| `EDAMAM_APP_ID` / `_KEY` | opcional | sí (lo describe como "fallback en la cascada de lookup") | **no**: solo `fallbackFoodApi`, que no es alcanzable | no | Variable muerta; el comentario de `config.ts` y el de `.env.example` describen una cascada que ya no existe |

**Decisión (2026-09-28):** `ANTHROPIC_API_KEY` y `SERPAPI_API_KEY` pueden salir del arranque del server, porque el server ya no hace requests directas a la IA. Siguen haciendo falta para el ETL (`ANTHROPIC_API_KEY` en `runMerge`/`qualityAI`), así que la limpieza tiene que separar la config del server de la del ETL (hoy el ETL importa `src/config.ts`). Va al backlog en la Fase 5.

### 2.5 Alcanzabilidad desde `main.ts` (`docs/raw/server-alcanzables-desde-main.txt`)

42 archivos de `src/` son alcanzables desde `main.ts` y 5 no lo son:

| Archivo no alcanzable | ¿Quién lo importa? | Clasificación preliminar (se confirma en la Fase 4) |
|---|---|---|
| `src/services/offService.ts` | **nadie** (ni siquiera tests) | muerto |
| `src/services/fallbackFoodApi.ts` | solo su test | muerto (cascada Edamam retirada) |
| `src/services/openBeautyFactsApi.ts` | solo su test | muerto (cascada OBF retirada) |
| `src/services/claudeService.ts` | `scripts/etl/jobs/runMerge.ts · enrichWithAI` + test | vivo pero fuera de lugar (solo ETL) |
| `src/domain/product/nutrientPlausibility.ts` | `claudeService`, `scripts/etl/lib/qualityHeuristics.ts` + test | vivo pero fuera de lugar (solo ETL) |

Exportaciones sin uso en **runtime** (`knip --production`) que interesan para la limpieza:

- `imageService.fetchRetailerImage`, `imageService.fetchSearchImageUrl`: sin usos (`enrichImages.ts` tiene su propia `fetchRetailerImages`).
- `cacheService.setCachedProduct`, `buildCachePayload`, `getCachedProductByNameKey`: solo las usa el ETL o nadie. El comentario de `routes/products/lookup.ts` ("el cold path AWAITEA el upsert al cache") describe un camino que ya no existe.
- `domain/product/productService.ts · normalizeProductQuery, buildProductSummary`: sin usos; el archivo es casi solo un re-export de `resolveProductStatus`.
- `redisService.unwrapCachedProduct`: se exporta solo para tests.
- `ftgEngine.ftgScore`, `ftgAnalyzeIngredients`, `ingredientCount`: solo scripts.
- ~30 re-exports del barrel `scoring/index.ts` sin consumidores (constantes y tipos).

### 2.6 Herramientas

| Herramienta | Resultado | Archivo crudo |
|---|---|---|
| `npx knip` (default, incluye tests como entry) | 5 archivos no usados, 1 dependencia no listada (`fastify-plugin`), 32 exports y 25 tipos sin uso | `raw/server-knip.txt` |
| `npx knip --production` (sin tests ni scripts) | 29 archivos fuera del grafo productivo (24 son scripts/ETL, esperable, y 5 de `src/`), `@anthropic-ai/sdk` sin uso en runtime, 47 exports y 48 tipos sin uso | `raw/server-knip-production.txt` |
| `npx madge --circular` | **sin ciclos** (66 archivos) | `raw/server-madge-circular.txt` |
| grafo `madge` desde `main.ts` | 42 alcanzables y 5 no | `raw/server-madge-grafo-desde-main.json`, `raw/server-alcanzables-desde-main.txt` |
| `tsc --noEmit` | OK | `raw/server-tsc.txt` |
| `vitest run` | 27 archivos, **421 tests OK** (incluye tests de código muerto: `fallbackFoodApi`, `openBeautyFactsApi`) | `raw/server-vitest.txt` |

### 2.7 Migraciones presentes (`migrations/`)

`001` a `010`, `012`, `013` y `014`. **Falta `011`**: el commit `a0560ca` renombró `010_manufacturer_info` → `012` y `011_score_nullable` → `013` porque chocaba con `010_incomplete_products.sql`. El hueco no es una migración perdida.

Objetos que crean las migraciones: tablas `products`, `saved_products`, `scan_history` y `products_staging`; funciones `is_username_available` y `search_products_by_name`; extensión `pg_trgm`; RLS en `saved_products`, `scan_history` y `products_staging` (esta última sin policies a propósito). Tablas que usa el código: `products`, `saved_products`, `scan_history` y `products_staging` (ETL). RPC que usa el código: `search_products_by_name` (server) e `is_username_available` (native).

No hay CLI de Supabase ni `psql` en esta máquina. Para reconciliar contra el schema **real** se preparó [`docs/sql/fase3-schema-real.sql`](sql/fase3-schema-real.sql) (solo lectura, sintaxis validada con el parser de Postgres). Se corre en el SQL Editor de Supabase y devuelve en un JSON: tablas, columnas, constraints, índices con su uso (`idx_scan`), triggers, RLS, policies, grants a `anon`/`authenticated`, funciones (security definer y quién puede ejecutarlas), extensiones y buckets. Una segunda consulta muestra si existe el registro de migraciones del CLI. El resultado ya está en [`docs/raw/supabase-schema.json`](raw/supabase-schema.json) (corrido el 2026-09-28 21:15 UTC).

### 2.7.1 Schema real vs. repo: primer cruce (el detalle por tabla va en la Fase 3)

Base: PostgreSQL 17.6. 2 usuarios en `auth.users`, sin buckets de storage. `products` tiene unas 75 mil filas (65 MB) y `products_staging` unas 236 mil (177 MB).

**La base NO se reconstruye desde `migrations/`.** Hay objetos en producción que ningún archivo del repo crea:

| # | Objeto en producción | ¿Está en `migrations/`? | ¿Quién lo usa? | Observación |
|---|---|---|---|---|
| 1 | tabla `profiles` (+ índice `lower(username)` único) | **no** (la `007` la da por existente) | native, directo: `select`/`update` en `PersonalDataScreen`, `ProfileScreen`, `useUserInitial` | se creó a mano |
| 2 | función `handle_new_user()` (security definer, inserta en `profiles` con la metadata del signup) + trigger `on_auth_user_created` (`AFTER INSERT ON auth.users FOR EACH ROW`, habilitado) | **no** | Supabase Auth, en cada signup (confirmado con la consulta 3) | se creó a mano |
| 3 | policy `"Anyone can read products"` (SELECT `true` para `anon` y `authenticated`) | **no** | **nadie legítimo**: native en `main` no lee `products` (verificado; lo hacía en la era Expo, entre `849bd54` y `ba53ac9`) | **HALLAZGO DE SEGURIDAD P0 (SEC-01)**: el catálogo entero se lee con la anon key, que viaja en la app, directo desde PostgREST, sin pasar por el server ni por su rate limit. No es intencional (confirmado 2026-09-28) |
| 4 | policies de `profiles` (select y update propios) | **no** | native | — |
| 5 | índice `products_barcode_unique_idx` (UNIQUE parcial `WHERE barcode IS NOT NULL`) | **no** | nadie en especial | **duplica** a `products_barcode_key` (UNIQUE de la `001`): 3,3 MB redundantes |
| 6 | tablas `productos_validados`, `registro_controles`, `validation_runs` | **no**. Figuran en `supabase_migrations.schema_migrations` como `20260923014352 validation_tables_v1` (aplicada con CLI o MCP el 2026-09-23) | **ningún código**: 0 commits que las mencionen en todo el historial de los dos repos (`git log --all --reflog -S`, incluidas las ramas descartadas) | **Origen desconocido, candidatas a eliminación** (clasificación confirmada 2026-09-28). Tuvieron escrituras reales (1155 inserts en `registro_controles`), así que algo con credenciales privilegiadas las escribió. Se eliminan por etapas (§7.2), nunca con DROP directo |
| 7 | COMMENT de `products.sello` | el de `main` (`013`) es otro | — | el texto en producción es el de la migración **`015` de la rama descartada `feat/sello-corte-40`**: esa migración **se aplicó en producción**. **Decisión D-09:** se trae al repo. Copia textual en [`raw/migracion-015-aplicada-en-prod.sql`](raw/migracion-015-aplicada-en-prod.sql) |

Otras observaciones del schema real:

1. **Registro de migraciones:** `schema_migrations` tiene una sola entrada (`validation_tables_v1`). Las `001`–`014` del repo se aplicaron a mano: no hay forma automática de saber cuáles están aplicadas.
2. **Grants:** `anon` y `authenticated` tienen todos los privilegios (incluido `TRUNCATE`) sobre las 8 tablas. Es el default de Supabase y el control real es RLS. **RLS está activo en las 8 tablas**, así que hoy no hay escritura pública: la única policy abierta es de lectura (SEC-01). Si alguien apagara RLS en una tabla, estos grants la dejarían escribible con la anon key; por eso el fix de SEC-01 incluye el revoke y no solo borrar la policy.
3. **RLS sin policies** (acceso solo con service role): `products_staging`, `productos_validados`, `registro_controles` y `validation_runs`. Es coherente con el uso actual.
4. **Estadísticas de uso:** `products` reporta `filas_vivas: 0` con 75 mil filas estimadas, así que los contadores se resetearon hace poco (probablemente en el upgrade a PG 17). Los `scans` de índices **no alcanzan** para decidir si un índice sobra.
5. **Funciones:** `search_products_by_name` e `is_username_available` se pueden ejecutar como `anon`, directo por RPC. `pg_trgm` está instalada en el schema `public`.
6. **Comentarios de columnas/tablas** que citan fuera de alcance o describen cosas retiradas: `products.data_source` y `products.name_key` (IA en el lookup), `products.engine_version` ("Agente ETL"), `products_staging` (`06-agente-etl-data.md`), `products.sello` (ADR-007).

### 2.7.2 Versión del motor en las columnas denormalizadas de `products` (consulta 4)

| `engine_version` | Filas | Sin `score` | Con `sello` | Última actualización |
|---|---|---|---|---|
| `ftg-rubric-v2` | 56.490 (69%) | 0 | 2.873 | 2026-08-18 |
| `ftg-rubric-v2.3` (la de `main`) | 24.779 (30%) | 20.091 (81%) | 2.606 | 2026-09-03 |
| `ftg-rubric-v1` | 180 (0,2%) | 0 | 120 | 2026-08-09 |
| **Total** | **81.449** | | | |

Lectura:

1. **No hay filas `v2.4`:** el ETL nunca escribió con el motor de la rama descartada. Lo único de esa rama que llegó a producción es el COMMENT de la `015`.
2. **El 70% del catálogo tiene `score`/`score_label`/`sello` calculados con un motor viejo** (v1/v2). **Hoy no afecta al usuario:** el runtime recalcula el puntaje en cada lectura a partir de los crudos (`productLookupService · mapRawToProduct` → `ftgScoreWithBreakdown`; `productRowMapper · joinedRowToProduct` para guardados e historial) y nunca lee esas columnas. Solo las leen scripts (`scripts/score-histogram.ts`, `scripts/etl/jobs/stats.ts`), que reportarían números mezclados de tres motores.
3. **El 81% de las filas escritas con v2.3 no tiene puntaje:** para esos productos, el lookup responde `score: null` ("sin puntaje"). No sabemos cuántas filas `v2` darían `null` con el motor actual, porque la v2 no admitía `null`. **Dato relevante para usabilidad (Fase 1):** una fracción grande del catálogo podría responder sin puntaje. Para medirla hace falta recalcular todo el catálogo con el motor actual (lectura, sin escribir).

### 2.7.3 Hallazgo temprano en scoring (alto riesgo, se detalla en la Fase 4)

`productLookupService.ts · mapRawToProduct` calcula `flagged: breakdown.score < 40` con un **40 hardcodeado**. Las bandas del motor (`scoring/constants.ts · TIERS`) cortan en 75/50/25 y la banda baja es `BAD_BELOW = 25`. Un producto con 30 puntos sale "Moderado" y `flagged: true` a la vez: es un umbral duplicado e inconsistente con la fuente. (La rama descartada lo corregía; con D-02 el problema sigue abierto en `main`).

### 2.8 Hallazgos tempranos de seguridad (se detallan en la Fase 4)

1. `GET /products/image` es público y hace `fetch` de **cualquier URL** del lado del server (riesgo de SSRF) y la manda a remove.bg con la key propia (costo abusable). El único freno es el rate limit de 60/min por IP.
2. CORS con `origin: true`.
3. El rate limit es en memoria: no se comparte entre instancias ni sobrevive a reinicios.
4. `/health` no refleja el estado de Supabase ni de Redis.
5. **SEC-01 (P0):** el catálogo (`products`) y la RPC `search_products_by_name` se leen públicamente con la anon key, salteando el server (§2.7.1 y §7.1).

### 2.9 Docs y comentarios que citan fuera de alcance o están desactualizados (se verifican en la Fase 4)

| Archivo | Cita / afirmación | Estado |
|---|---|---|
| `README.md:11-12` | ADR-002 y `fitogenix-agents/BITACORA_DECISIONES.md` | fuente fuera de alcance |
| `README.md:113-116` | `ANTHROPIC_API_KEY` = "Nivel IA (lookup + enriquecimiento)", `SERPAPI` = "imagen de fallback", Edamam = "Nivel 2" | **falso para el runtime actual** (§2.4) |
| `README.md:147-159` | verificación en vivo de OBF y Edamam | describe la cascada retirada |
| `scripts/etl/README.md:3`, `qualityHeuristics.ts:4`, `auditDataQuality.ts:14` | `fitogenix-agents/06-agente-etl-data.md` | fuente fuera de alcance |
| `migrations/013`, `014` | ADR-002 y BITACORA | fuente fuera de alcance |
| `MOTOR_V21_INFORME.md` (raíz) | informe del motor v2.1 | el motor está en v2.3 |
| `config.ts:18-19`, `.env.example:13-15` | Edamam como "nivel 3 de la cascada" | cascada inexistente |
| `routes/products/lookup.ts:42-47` | "el cold path AWAITEA el upsert al cache" | ya no hay cold path |

---

## 3. fitogenix-native: ¿qué está vivo?

**Conclusión (confirmada 2026-09-28): native es el cliente activo de fitogenix-server.** Se descarta la premisa inicial de tratarlo como código muerto. Es una app mobile pensada para App Store y Google Play, **todavía sin publicar**. Tiene desarrollo activo de dos autores (último commit 2026-09-21) y usa 6 de los 8 endpoints. Consecuencia para las fases siguientes: en native solo se limpia lo muerto puntual (§3.3), y las pantallas de la Fase 1 se **relevan** del código en vez de proponerse.

### 3.1 Llamadas a fitogenix-server (URL base `EXPO_PUBLIC_BACKEND_URL`, fallback `http://localhost:3000`)

| # | Endpoint del server | Llamado desde (archivo · símbolo) | Estado |
|---|---|---|---|
| 1 | `POST /products/lookup` | `src/api/client.ts · lookupProduct` (timeout 30 s, Bearer opcional) | vivo |
| 2 | `GET /users/me/saved` | `src/api/client.ts · fetchSavedProducts` | vivo |
| 3 | `POST /users/me/saved` | `src/api/client.ts · saveProductRemote` | vivo |
| 4 | `DELETE /users/me/saved/:id` | `src/api/client.ts · unsaveProductRemote` | vivo |
| 5 | `GET /users/me/history` | `src/api/client.ts · fetchScanHistory` | vivo |
| 6 | `GET /products/image?url=` | `src/components/CleanProductImage.tsx` | vivo |
| 7 | `DELETE /users/me` | **nadie**. `src/screens/ProfileScreen.tsx:148` hace `fetch('/api/delete-account')`, una ruta Expo `+api` que **ya no existe** en `main` | **roto**: el borrado de cuenta en la app no llega al server |
| 8 | `GET /health` | nadie | — |

Único consumidor de `src/api/client.ts`: `src/presentation/scanResultStore.tsx`.

### 3.2 Llamadas directas a Supabase (sin pasar por el server)

- Auth: `signInWithPassword`, `signUp`, `signInWithIdToken` (Google en `lib/googleAuth.ts`, Apple en `lib/appleAuth.ts`), `resetPasswordForEmail`, `verifyOtp`, `updateUser`, `signOut`, `getSession` y `onAuthStateChange`.
- RPC: `is_username_available` (migración `007` del server), desde `SignUpDetailsScreen.tsx` y `PersonalDataScreen.tsx`.
- Tabla `profiles`: `select` en `ProfileScreen.tsx`, `PersonalDataScreen.tsx` y `useUserInitial.ts`; `update` (nombre, apellido, username, teléfono) en `PersonalDataScreen.tsx` y `ProfileScreen.tsx`. Todo el módulo "cuenta/perfil" vive entre native y Supabase, **sin pasar por el server**, y la tabla no está en `migrations/` (§2.7.1).

### 3.3 Muerto o roto dentro de native

| Ítem | Evidencia |
|---|---|
| `src/domain/product/ftgEngine.ts` | nadie lo importa (knip + grep): motor local muerto |
| `src/presentation/hooks/useUserInitial.ts` | knip: sin usos |
| `design_handoff_scan_home/*`, `Fitogenix onboarding flow design.zip`, `database/openfoodfacts_export.csv`, `fitogenix_scoring_*.md` | material de diseño y datos commiteado en el repo del cliente |
| `plugins/withGoogleSignInModularHeaders.js` | knip lo marca, pero está referenciado en `app.json`: **falso positivo** |
| `expo-apple-authentication` | se usa (`lib/appleAuth.ts`, `app.json`) pero **no está en `package.json`** ni instalado → `tsc` falla |
| `tsc --noEmit` | **6 errores** (`raw/native-tsc.txt`): módulo faltante, `absoluteFillObject`, rutas tipadas `/onboarding` y `/location`, un icono inexistente. El CI de native corre `tsc`, así que `main` quedaría en rojo |
| `vitest` | 5 archivos, 49 tests OK |
| `madge --circular` | sin ciclos |

### 3.4 Deploy de native

Confirmado: **no está deployado**. El objetivo son App Store y Google Play.

| Señal | Qué dice |
|---|---|
| `eas.json` | perfiles de build EAS; `submit.production.ios.ascAppId = "YOUR_APP_STORE_CONNECT_APP_ID"` (placeholder), coherente con "sin publicar" |
| `vercel.json`, `package.json · scripts.build` (`expo export --platform web`), `app.json · web.output: "server"`, `react-native-web`/`react-dom` | restos de un target web que no está en el objetivo (y además inconsistentes entre sí): candidatos a eliminar en la Fase 4 |
| URL del server | `EXPO_PUBLIC_BACKEND_URL` con fallback `http://localhost:3000` (`src/api/client.ts`, `CleanProductImage.tsx`): en un build de store sin la variable, la app apuntaría a localhost |
| `.env` local | contiene `SUPABASE_SECRET_KEY`, `ANTHROPIC_API_KEY` y `SERPAPI_API_KEY`, que el cliente en `main` no usa. No están commiteados (`.gitignore`), pero son secretos de server en la máquina de desarrollo del cliente |
| `CLAUDE.md` de native | cita `fitogenix-agents/CONTEXT.md §…` como fuente: fuera de alcance |

---

## 4. Decisiones tomadas en la Fase 0 (2026-09-28)

| # | Tema | Decisión |
|---|---|---|
| D-01 | Base de la auditoría | Solo `main`, que es lo que corre en Render. Se borraron todas las demás ramas |
| D-02 | Trabajo no mergeado (sello v2.4, fix de paginación del ETL, WIP de native) | Se descarta. No entra al backlog |
| D-03 | fitogenix-native | Es el **cliente activo**, mobile (App Store / Google Play), sin publicar. No es código muerto |
| D-04 | Deploy del server | Render: build `npm install && npm run build`, start `node dist/main.js`, Node "la del server" (hoy no declarada) |
| D-05 | `ANTHROPIC_API_KEY` / `SERPAPI_API_KEY` | Salen del arranque del server; el server no hace requests directas a la IA |
| D-06 | Commits | No se commitea nada hasta que estén completos el análisis y el plan (Fase 5) |
| D-07 | Tablas `productos_validados`, `registro_controles`, `validation_runs` | Origen desconocido, candidatas a eliminación. Se eliminan en tres pasos (backup, revoke durante 2 semanas, DROP), nunca con DROP directo. Ítem **P1** del plan |
| D-08 | Lectura pública del catálogo | No es intencional. El único acceso legítimo al catálogo es fitogenix-server con service role. Hallazgo **SEC-01, P0**; su fix entra al plan como **P0** |
| D-09 | Migración `015` (aplicada en producción, código descartado) | Se trae al repo como `migrations/015_sello_comment_sin_umbrales.sql`, **sin tocar la base** (ya está aplicada). Por la regla "solo escribo en `docs/`" no se crea ahora: queda como ítem del plan (§7.3), con la copia textual en `docs/raw/` |

## 5. Resumen

1. Las dos repos quedaron solo con `main`. El trabajo no mergeado se descarta (hay bundles de resguardo en `~/fitogenix-backups/`).
2. Server: 8 rutas, 42 archivos vivos, 5 de `src/` no alcanzables (3 muertos y 2 que usa solo el ETL). Sin ciclos, tsc OK, 421 tests OK.
3. Server: `ANTHROPIC_API_KEY` y `SERPAPI_API_KEY` bloquean el arranque sin uso; Edamam está muerto; `fastify-plugin` no está declarada; la versión de Node no está fijada.
4. Server: `/products/image` es público, sin validación y hace fetch de URLs arbitrarias.
5. Las docs del server (README, `.env.example`, comentarios) describen la cascada retirada.
6. Native es el cliente activo: usa 6 de las 8 rutas y maneja `profiles` directo contra Supabase. El borrado de cuenta está roto (`/api/delete-account`), `main` no compila (6 errores de `tsc`) y quedan restos de un target web.
7. Supabase: **`migrations/` no reproduce la base**. Hay 3 tablas de validación, `profiles`, `handle_new_user`, una policy de lectura pública del catálogo y un índice duplicado que no están en el repo. La migración `015` de la rama descartada está aplicada. Solo 1 migración está registrada en `schema_migrations`. **SEC-01 (P0):** el catálogo se lee públicamente con la anon key.
8. Datos: el 70% del catálogo tiene puntajes denormalizados de motores viejos (no afecta al usuario: el runtime recalcula). El 81% de las filas v2.3 no tiene puntaje. Scoring: `flagged` usa un 40 hardcodeado que contradice la banda baja (25).

## 6. [PREGUNTA] pendientes

Ninguna. La Fase 0 queda cerrada a la espera del "OK fase 0".

## 7. Anticipos para las fases siguientes (decididos en la Fase 0)

Se registran acá para que no se pierdan. Cada uno se formaliza en su fase: RNF en la Fase 1, brecha en la Fase 4, ítem de backlog en la Fase 5.

### 7.1 SEC-01 · Lectura pública del catálogo con la anon key (P0)

**RNF (Fase 1), seguridad:** *"Ningún dato de catálogo es accesible con la anon key."* Medida: con la anon key, `GET /rest/v1/products`, `GET /rest/v1/products_staging` y `POST /rest/v1/rpc/search_products_by_name` responden con error de permisos (no con filas ni con una lista vacía), y el lookup del server sigue respondiendo 200.

**Precondiciones del fix:**

| # | Verificación | Estado |
|---|---|---|
| V-01 | native (`main`) no lee `products`, `products_staging` ni llama `search_products_by_name` | **Verificado** 2026-09-28: sus únicos accesos directos son `from('profiles')` y `rpc('is_username_available')` |
| V-02 | La `SUPABASE_SECRET_KEY` cargada en Render es la secret/service role y no la anon. El server lee el catálogo con esa key (`cacheService`, `savedProductsService`, `scanHistoryService`); si fuera la anon, el fix rompería el lookup | **Verificado** 2026-09-28: la key de Render tiene el prefijo `sb_secret_`, o sea una secret key del formato nuevo de Supabase, que opera con el rol `service_role` y saltea RLS. El revoke a `anon`/`authenticated` no afecta al server |
| V-03 | No hay builds viejos de la app (era Expo) instalados que lean `products` directo | Bajo riesgo: la app nunca se publicó en stores. Confirmar si hay dev builds en uso |

**Fix propuesto (se detalla con SQL, tests y rollback en la Fase 5):**

1. Borrar la policy `"Anyone can read products"`.
2. `REVOKE` de todos los privilegios de `anon` y `authenticated` sobre `products` y `products_staging` (RLS queda activo, como segunda barrera).
3. `REVOKE EXECUTE` de `search_products_by_name` para `anon`, `authenticated` **y `PUBLIC`** (Postgres le da `EXECUTE` a `PUBLIC` por default en toda función nueva).
4. Revisar los default privileges de Supabase en `public`, para que una tabla o función nueva no vuelva a quedar expuesta.
5. Verificación después del fix: pruebas negativas con la anon key (las del RNF) + smoke test de `POST /products/lookup` por barcode y por nombre.
6. Rollback: recrear la policy y los grants (script en la Fase 5).

**Scripts (2026-09-29):** [`sql/u01/`](sql/u01/README.md). El punto 4 (default privileges) pasa a C-05 (D-61).

No se tocan `is_username_available` ni `profiles`: los usa native legítimamente. **Actualización (D-28, ADR-0010):** cuando native deje de hablar con Supabase, también se revoca el acceso `anon` a `profiles` e `is_username_available`: `anon` queda sin acceso a nada.

### 7.2 DB-01 · Eliminación por etapas de las tablas de validación (P1)

Tablas: `productos_validados`, `registro_controles`, `validation_runs`. En tres pasos, nunca DROP directo:

| Paso | Acción | Criterio para avanzar |
|---|---|---|
| 1. Backup | Exportar las tres tablas (datos + DDL) fuera de la base y guardar el export con fecha | Export verificado (conteo de filas igual al de la base) |
| 2. Revoke por 2 semanas | `REVOKE ALL` para `anon`, `authenticated` **y `service_role`**. Revocar solo a `anon`/`authenticated` no detecta nada: ya no tienen policies, y lo que escribió estas tablas usó credenciales privilegiadas. Se toma una foto de `pg_stat_user_tables` al empezar | Durante 14 días: ningún error de permisos reportado por ningún proceso y contadores de `pg_stat_user_tables` sin cambios |
| 3. DROP | `DROP TABLE` de las tres (el orden no importa: solo referencian a `products` con `ON DELETE RESTRICT`) y registro del cambio como migración en el repo | — |

Consecuencia secundaria: los dos FK `ON DELETE RESTRICT` hacia `products` desaparecen, y hoy impiden borrar un producto que tenga validaciones.

### 7.3 DB-02 · El repo tiene que reproducir la base de producción (P1)

Hoy `migrations/` no reconstruye la base (§2.7.1). Ítem para el plan:

1. Traer la `015` tal cual se aplicó (D-09), desde [`raw/migracion-015-aplicada-en-prod.sql`](raw/migracion-015-aplicada-en-prod.sql).
2. Una migración de "baseline" que documente los objetos creados a mano: tabla `profiles` con su índice y sus policies, `handle_new_user()` y el trigger `on_auth_user_created`. Escrita idempotente (`IF NOT EXISTS` / `CREATE OR REPLACE`) para no tocar producción al aplicarla.
3. Eliminar el índice duplicado `products_barcode_unique_idx` (lo cubre `products_barcode_key`).
4. Las tablas de validación **no** entran al baseline: se eliminan por DB-01.
5. Definir un único mecanismo de aplicación y registro de migraciones (hoy conviven "a mano" y `schema_migrations`); se decide en un ADR de la Fase 2.

