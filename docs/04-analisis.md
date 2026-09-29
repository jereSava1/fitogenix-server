# Fase 4 — Análisis de brechas

> Fecha: 2026-09-28 · Base: `main` de fitogenix-server (`dae49be`) y de fitogenix-native (`976c015`).
> Compara el código vivo contra lo que se decidió en las Fases 1 a 3 (requisitos, arquitectura y contrato objetivo). Evidencia = archivo + símbolo.

Estados de la matriz de requisitos:

| Estado | Significado |
|---|---|
| **IMPLEMENTADO** | Cumple el requisito tal como quedó definido |
| **PARCIAL** | Existe, pero le falta parte del objetivo (p. ej. pasar por el server, un campo, `/v1`) |
| **NO IMPLEMENTADO** | No existe |
| **INCONSISTENTE** | Existe, pero hace algo distinto de lo que promete o contradice otra parte del sistema |
| **ELIMINAR** | Existe y se decidió quitarlo |

---

## 1. Matriz requisito → código

### 1.1 Requisitos funcionales

| RF | Requisito (resumen) | Estado | Brecha (evidencia) |
|---|---|---|---|
| RF-001 | Lookup por barcode | IMPLEMENTADO | Falta `/v1` y el contrato nuevo (§1.3). Una caída de la base se responde como 404 (ver RF-003) |
| RF-002 | Lookup por nombre | IMPLEMENTADO | Ídem |
| RF-003 | 404 "no está en el catálogo" | **INCONSISTENTE** | También responde 404 cuando **la base falla** (`cacheService.ts · getCachedBy`, `findCachedProductByName`: `if (error …) return null`) |
| RF-004 | Validación del lookup | IMPLEMENTADO | Falta `additionalProperties: false` |
| RF-005 | Puntaje y explicación | **INCONSISTENTE** | `flagged = score < 40` contradice la banda baja (25) (`productLookupService.ts · mapRawToProduct`); `id` = query en el lookup y uuid en los listados; la app **no muestra `noScore`** |
| RF-006 | Registrar escaneo con sesión | IMPLEMENTADO | Valida el token dos veces (`requireAuth` no aplica acá; `resolveUserIdFromToken` en segundo plano) |
| RF-007 | Imagen sin fondo (remove.bg) | **ELIMINAR** (D-49) | `routes/products/image.ts`, `imageService.ts · removeBackground` |
| RF-008 | Mostrar `imageUrl` directo | PARCIAL | Native intenta primero `/products/image` y cae al original (`CleanProductImage.tsx`) |
| RF-010 | Listar guardados | PARCIAL | Devuelve el detalle completo, sin `savedAt`, sin schema de respuesta (`savedProductsService.ts · listSavedProducts`) |
| RF-011 | Guardar | IMPLEMENTADO | — |
| RF-012 | Quitar guardado | IMPLEMENTADO | — |
| RF-013 | Listar historial | PARCIAL | Sin `scannedAt`; rango de `limit` en el handler en vez del schema |
| RF-014 | Migrar historial anónimo | IMPLEMENTADO | (native) |
| RF-015 | Quitar ítem del historial (local) | **INCONSISTENTE** | Se borra solo en el teléfono y vuelve al sincronizar (`scanResultStore.tsx · removeFromHistory`) |
| RF-016 | Migración única de guardados viejos | IMPLEMENTADO | Código de transición; candidato a borrar cuando no queden instalaciones viejas (la app nunca se publicó: **se puede borrar ya**) |
| RF-017 | `DELETE /users/me/history/:productId` | NO IMPLEMENTADO | — |
| RF-020 | Registro | **INCONSISTENTE** | El teléfono no se guarda (`handle_new_user` no lo copia); además va directo a Supabase (D-28) |
| RF-021 | Username disponible | PARCIAL | Directo a Supabase (RPC); objetivo: `GET /v1/auth/username-availability` |
| RF-022 | Login con email | PARCIAL | Directo a Supabase; objetivo: `/v1/auth/login` |
| RF-023 | Login con Google | PARCIAL | Ídem |
| RF-024 | Login con Apple | **INCONSISTENTE** | **No compila**: `expo-apple-authentication` no está en `package.json` (`lib/appleAuth.ts`) |
| RF-025 | Recuperar contraseña | PARCIAL | Directo a Supabase |
| RF-026 | Usar sin cuenta | IMPLEMENTADO | — |
| RF-027 | Cerrar sesión | PARCIAL | Directo a Supabase |
| RF-028 | Ver y editar perfil | PARCIAL | Directo a `profiles` |
| RF-029 | Eliminar cuenta | **INCONSISTENTE** → corregido en U-03 (`97d4998`, rama de integración de native) | Roto de punta a punta: la app llama `/api/delete-account` (no existe, `ProfileScreen.tsx:148`) y `DELETE /users/me` no lo llama nadie. **Bloquea App Store** |
| RF-030 | Exigir sesión en rutas privadas | IMPLEMENTADO | **0 tests**; responde 401 cuando Auth está caído (RNF-D03) |
| RF-040 | Onboarding en el primer uso | **INCONSISTENTE** | Aparece **siempre**: persistencia comentada (`lib/onboardingGate.ts`, "TODO restore when done testing") |
| RF-041 | Guía | IMPLEMENTADO | Promete "foto de la etiqueta" (roadmap, RF-061) |
| RF-042 | Ayuda y soporte | **INCONSISTENTE** | Enlaza a `/terms`, que no existe (`HelpScreen.tsx:114`) |
| RF-043 | Feedback | **INCONSISTENTE** | Simulado: `setTimeout` de 700 ms, no envía nada (`FeedbackScreen.tsx · handleSend`) |
| RF-044 | Reportar problema | **INCONSISTENTE** | Simulado (`ProductIssueModal.tsx`) |
| RF-045 | Política de privacidad | PARCIAL | Tiene que informar el tratamiento de datos de salud del onboarding (RNF-S10) |
| RF-046 | Ubicación | **ELIMINAR** (D-23) | `LocationScreen.tsx` (maqueta) + fila "Accesibilidad" en `ProfileScreen.tsx` |
| RF-047 | Analítica de escaneos fallidos | **INCONSISTENTE** | Sin destino: `setAnalyticsSink` nunca se llama, los eventos se descartan. Diferido por D-61 ([DT-05](deuda-tecnica.md)) |
| RF-048 | Guardar onboarding al crear cuenta | NO IMPLEMENTADO | — |
| RF-050 | Health check | PARCIAL | Sin readiness (`/health` siempre 200) |
| RF-051 | ETL: ingesta | IMPLEMENTADO | VTEX no trae contenido neto (DT-03) |
| RF-052 | ETL: merge | **INCONSISTENTE** → corregido en U-02 (`d9fabb5`, rama de integración) | **Bug en `main`:** `scripts/etl/lib/staging.ts · fetchRowsForBarcodes` hace `.in('barcode', …)` **sin paginar**, y PostgREST corta la respuesta: el merge procesa solo una parte de cada lote. El arreglo existía en la rama descartada `fix/renumerado-migraciones` (commit `6c4b561`, "cada merge procesaba el 64%"; hoy solo en el bundle de respaldo) |
| RF-053 | ETL: calidad de datos | IMPLEMENTADO | — |
| RF-054 | ETL: imágenes y Cencosud | IMPLEMENTADO | — |
| RF-060 | Alternativas mejores | NO IMPLEMENTADO | Roadmap, antes de tiendas (D-24) |
| RF-061 | Ingredientes desde foto de etiqueta | NO IMPLEMENTADO | Roadmap, antes de tiendas (D-24) |
| RF-062 | Metales pesados en el puntaje | NO IMPLEMENTADO | Con la refactorización del motor (D-25) |
| RF-063 | Contenido neto y nutrición por envase | NO IMPLEMENTADO | Diferido (DT-03) |

**Totales (45 filas: los 43 RF más RF-007 y RF-046, que se listan aunque se eliminen):**

| Estado | Cantidad | RF |
|---|---|---|
| IMPLEMENTADO | 14 | 001, 002, 004, 006, 011, 012, 014, 016, 026, 030, 041, 051, 053, 054 |
| PARCIAL | 11 | 008, 010, 013, 021, 022, 023, 025, 027, 028, 045, 050 |
| INCONSISTENTE | 12 | 003, 005, 015, 020, 024, 029, 040, 042, 043, 044, 047, 052 |
| NO IMPLEMENTADO | 6 | 017, 048, 060, 061, 062, 063 |
| ELIMINAR | 2 | 007, 046 |

### 1.2 Requisitos no funcionales (solo los que hoy **no** se cumplen)

| RNF | Qué falla | Evidencia |
|---|---|---|
| RNF-U01 | Una caída de la base se muestra como "no está en el catálogo" | RF-003 |
| RNF-U03 | Sin explicación visible cuando no hay puntaje; cobertura sin medir | `noScore` no se muestra; DT-02 |
| RNF-U04 | La tasa de fuera de catálogo no se puede medir | RF-047 |
| RNF-U05 | Guardar sin cuenta marca el ícono y no guarda | `scanResultStore.tsx · toggleSaved` |
| RNF-U06 | Ícono de guardado incorrecto | `id` con dos significados |
| RNF-U07 | Lo borrado del historial vuelve | RF-015 |
| RNF-U08 | Onboarding en cada arranque | RF-040 |
| RNF-U09 | El texto promete funciones inexistentes | Aceptado como roadmap (D-22) |
| RNF-U11 | Accesibilidad | 0 `accessibilityLabel` en 72 `Pressable`; sin "reducir movimiento" |
| RNF-P01–P04 | Performance sin medir | No hay métricas; los logs de Fastify alcanzan para empezar |
| RNF-P05 | Arranque en frío | Render plan free (D-18) |
| RNF-D01 | Redis caído agrega segundos por request | `@upstash/redis` con 5 reintentos por default, sin timeout |
| RNF-D02 | Base caída → 404 | RF-003 |
| RNF-D03 | Auth caído → 401 | `plugins/auth.ts` |
| RNF-D05 | Health no refleja dependencias | `main.ts` |
| RNF-D07 | Disponibilidad sin medir | Sin monitoreo externo |
| RNF-S01 | Catálogo legible con la anon key | SEC-01 |
| RNF-S04 | Rate limit en memoria, único para todo | `main.ts` |
| RNF-S05 | SSRF en `/products/image` | Se resuelve eliminando el endpoint (D-49) |
| RNF-S06 | CORS abierto | `origin: true` en `main.ts` |
| RNF-S07 | Secretos fuera de lugar | §4.4 |
| RNF-S08 | Eliminar cuenta no funciona | RF-029 |
| RNF-S10 | Consentimiento de datos de salud | Nace con RF-048 |

### 1.3 Contrato actual vs. objetivo

Todas las brechas del contrato están detalladas en [03-contratos.md](03-contratos.md): 22 → 12 campos, `id` único, errores `{ error, code }`, `/v1`, schemas de respuesta en todas las rutas (hoy 1 de 8), 16 endpoints nuevos y 1 eliminado.

---

## 2. Matriz inversa: código → uso

### 2.1 (a) Código muerto: se elimina

| # | Archivo · símbolo | Evidencia | Arrastra |
|---|---|---|---|
| 1 | `src/services/offService.ts` | Sin importadores (knip) | — |
| 2 | `src/services/fallbackFoodApi.ts` + test | Solo lo importa su test | `EDAMAM_APP_ID`, `EDAMAM_APP_KEY` |
| 3 | `src/services/openBeautyFactsApi.ts` + test | Solo lo importa su test | — |
| 4 | `src/services/imageService.ts · fetchRetailerImage`, `fetchSearchImageUrl` | Sin usos | `SERPAPI_API_KEY` |
| 5 | `src/services/imageService.ts · removeBackground` + `src/routes/products/image.ts` | D-49 | `REMOVE_BG_API_KEY` |
| 6 | `src/domain/product/productService.ts` | Re-export + 2 funciones sin uso | — |
| 7 | `src/services/cacheService.ts · getCachedProductByNameKey` | Sin usos | — |
| 8 | `src/domain/product/scoring/index.ts`: ~30 re-exports sin consumidores | knip | — |
| 9 | `scripts/test-search-rpc.ts` | D-31 | — |
| 10 | `MOTOR_V21_INFORME.md` (raíz) | Informe del motor v2.1; el motor está en v2.3. Mover a `docs/historia/` o borrar **[PREGUNTA]** | — |
| 11 | Dependencia `@anthropic-ai/sdk` en `dependencies` | El runtime no la usa | Pasa a `devDependencies` (ETL) |
| 12 | Hook `prestart` de `package.json` | Render no lo ejecuta (start = `node dist/main.js`) | — |
| N1 | native `src/domain/product/ftgEngine.ts` | 0 importadores | — |
| N2 | native `src/presentation/hooks/useUserInitial.ts` | knip: sin usos | — |
| N3 | native `design_handoff_scan_home/**`, `Fitogenix onboarding flow design.zip`, `database/openfoodfacts_export.csv`, `fitogenix_scoring_engine_v2_1.md`, `fitogenix_scoring_rubric.md` | Material de diseño y datos versionados en el repo de la app | Mover fuera del repo |
| N4 | native `vercel.json`, script `build` web, `app.json · web.output`, `react-native-web`, `react-dom` | No hay target web (D-02 de la Fase 0) | — |
| N5 | native `@expo/ngrok` | knip: devDependency sin uso | — |
| N6 | native `src/screens/LocationScreen.tsx` + ruta `/location` + fila "Accesibilidad" | D-23 | — |
| N7 | native `src/domain/product/lookupProduct.ts` (shim) y `src/lib/contracts/product.ts` (espejo) | Reemplazados por tipos generados (ADR-0011) | — |
| N8 | native `migrateLocalSavedIfNeeded` (RF-016) | La app nunca se publicó: no hay instalaciones viejas | — |
| N9 | native `src/lib/supabase.ts`, `googleAuth`/`appleAuth` en su parte Supabase, `@supabase/supabase-js` | D-28 (todo por el server) | `EXPO_PUBLIC_SUPABASE_*` |

### 2.2 (b) Vivo pero fuera de lugar: se mueve

| Archivo · símbolo | Hoy | Destino (02-arquitectura.md §5) |
|---|---|---|
| `src/services/claudeService.ts` | Solo lo usa el ETL (`runMerge.ts`) | `etl/enrichment/` |
| `src/domain/product/nutrientPlausibility.ts` | Solo ETL + `claudeService` | `etl/quality/` |
| `cacheService.ts · buildCachePayload`, `setCachedProduct`, `findUpgradableNameRow` | Solo ETL | `catalog` · escritor (API pública para el ETL) |
| `ftgEngine.ts · extractNutrition`, `extractCategory` | Dentro de la fachada del motor | `catalog/domain/productData.ts` |
| `scanHistoryService.ts · resolveUserIdFromToken` | Servicio de historial | `platform/http/auth.ts · optionalAuth` |
| `productRowMapper.ts` | Existe para esquivar un ciclo | `catalog` · `productSummaryFromRow` |
| `src/config.ts` | Compartido entre server y ETL | `platform/config.ts` + `etl/config.ts` |
| `types/fitogenix.ts · RawOFFProduct` | Tipos globales | `catalog/domain/rawProduct.ts` |
| `scripts/etl/**` | Importa el interior de `src/` (22 imports, dependency-cruiser) | `etl/` con APIs públicas |
| `productLookupService.ts · scorePresentation` + `flagged` | En el lookup | `scoring.presentScore` |

### 2.3 (c) Vivo y bien ubicado: se conserva (solo cambia de carpeta)

`src/domain/product/scoring/**` (motor, con buena cobertura de tests), `src/domain/product/ingredientData.ts`, `src/routes/**` (salvo `image.ts`), `src/plugins/auth.ts` (→ `platform`), `savedProductsService.ts` y `scanHistoryService.ts` (lógica correcta, se parten en caso de uso + repositorio), `redisService.ts` (→ adaptador), `queryNormalization.ts`, `scripts/{audit-scores,score-histogram,capture-golden,add-en-aliases}.ts` (herramientas de curaduría del motor), `scripts/etl/**` (lógica de ingesta).

---

## 3. Documentación y configuración desactualizadas

### 3.1 fitogenix-server

| Archivo (línea) | Qué dice | Qué pasa en realidad | Acción |
|---|---|---|---|
| `README.md:11-12` | Cita ADR-002 y `fitogenix-agents/BITACORA_DECISIONES.md` | Fuente fuera de alcance | Reescribir sin la cita |
| `README.md:113-118` | `ANTHROPIC_API_KEY` = "nivel IA (lookup)", `SERPAPI` = "imagen de fallback", Edamam = "nivel 2", `REMOVE_BG` | Ninguna se usa en runtime | Reescribir la tabla con lo que usa el server |
| `README.md:130-135` | "si el catálogo lanza, el error se propaga" | `cacheService` **se traga** el error y devuelve `null` → 404 | Corregir (y el código, ADR-0006) |
| `README.md:147-159` | Verificación en vivo de la cascada OBF/Edamam | La cascada no existe | Borrar |
| `README.md:170` | `GET /products/image` con remove.bg | Se elimina (D-49) | Borrar |
| `.env.example` | `ANTHROPIC_API_KEY` y `SERPAPI_API_KEY` sin marcar; `REMOVE_BG_API_KEY`; Edamam "en la cascada de lookup" | Ver arriba | Dejar solo lo que usa el server |
| `src/config.ts:18-19` | Edamam, "nivel 3 de la cascada" | Muerto | Borrar |
| `src/services/productLookupService.ts:37-38` | "offService/claudeService/openBeautyFactsApi/fallbackFoodApi/imageService NO se tocaron: el ETL los sigue usando" | **Falso:** el ETL solo usa `claudeService` | Borrar con el código muerto |
| `src/routes/products/lookup.ts:42-47` | "el cold path AWAITEA el upsert al cache" | No hay cold path desde catalog-only | Corregir |
| `src/services/scanHistoryService.ts:36-40` | Ídem ("AWAITEA setCachedProduct desde la migración 006") | Ídem | Corregir |
| `src/services/redisService.ts:24` | Cita `productLookupService.doResolveWithImages` | **Esa función no existe** | Corregir |
| `src/services/redisService.ts` (cache texto→barcode) | "Evita el OFF search (~500ms)" | Ya no hay búsqueda en OFF | Corregir |
| `src/routes/products/lookupSchema.ts` | `dataSource: off \| obf \| edamam \| ai` | Sale del contrato (D-33) | Se reescribe con TypeBox |
| `package.json · description` | "product lookup, scoring pipeline, image proxy" | Sin image proxy (D-49) | Corregir |
| `MOTOR_V21_INFORME.md` | Estado del motor v2.1 | v2.3 | Ver §2.1 #10 |
| `scripts/etl/README.md:3`, `qualityHeuristics.ts:4`, `auditDataQuality.ts:14` | `fitogenix-agents/06-agente-etl-data.md` | Fuera de alcance | Quitar la cita |
| `migrations/013`, `014` (comentarios) | ADR-002, BITACORA | Fuera de alcance | Quedan en `legacy/` como historia (ADR-0009) |
| COMMENTs de la base (`products.data_source`, `name_key`, `engine_version`, `products_staging`, `sello`) | IA en el lookup, "Agente ETL", ADR-007 | Retirado o fuera de alcance | Se corrigen o desaparecen con las columnas (D-35, D-41) |

### 3.2 fitogenix-native

| Archivo | Problema | Acción |
|---|---|---|
| **`ENVIRONMENT.md`** | **Contiene en texto plano las claves reales de producción** (secret key de Supabase, Anthropic, SerpAPI). No está versionado (`.gitignore`), pero está en disco | Ver §4.4, **SEC-02** |
| `README.md` | Plantilla de `create-expo-app`, sin nada del proyecto | Reescribir |
| `AGENTS.md` | "Read the docs for v56"; el proyecto usa Expo 57 | Corregir |
| `CLAUDE.md` | "El SSOT no está en este repo" → `fitogenix-agents/CONTEXT.md` | Fuente fuera de alcance: reescribir |
| `.env.example` | Lista `ANTHROPIC_API_KEY`, `SERPAPI_API_KEY`, `REMOVE_BG_API_KEY` y `SUPABASE_SECRET_KEY` ("Used by /api/delete-account") | Dejar solo `EXPO_PUBLIC_BACKEND_URL` y los client IDs de Google (D-28) |
| `src/api/client.ts:15-19` | "La app seguirá usando los API routes de Expo si el servidor no está disponible" | No hay API routes de Expo | Corregir |
| `src/components/CleanProductImage.tsx:20` | "via /api/remove-bg" | No existe; y se elimina remove.bg (D-49) | Reescribir el componente |
| `src/constants/scanCopy.ts` (encabezado) | Cita `fitogenix-agents/01-agente-ux.md` | Fuera de alcance | Quitar la cita |
| `src/lib/onboardingGate.ts` | TODO de testing dejado activo | RF-040 | Restaurar |
| `eas.json` | `ascAppId` de ejemplo; el `appleId` es un **email personal** versionado | Dato personal en el repo | Pasar a variable de EAS o config privada |
| **`docs/REFACTOR_PLAN.md`** | Plan de refactor de native (2026-09-21) | Choca con D-28, ADR-0011 y D-49 (ver §5) | Reconciliar |

---

## 4. Violaciones y riesgos técnicos

### 4.1 Capas

| # | Violación | Evidencia |
|---|---|---|
| 1 | 6 archivos fuera de infraestructura usan `@supabase/*` o `@upstash/*` | dependency-cruiser (`supabase-redis-solo-en-infra`) |
| 2 | 22 imports del ETL y los scripts al interior de `src/` | dependency-cruiser (`scripts-solo-apis-publicas`) |
| 3 | `@anthropic-ai/sdk` en código del server | dependency-cruiser (`anthropic-solo-en-etl`) |
| 4 | Una **ruta** crea un cliente Supabase **en cada request** | `routes/users/deleteMe.ts` |
| 5 | La ruta del lookup parsea el token y orquesta el registro del escaneo | `routes/products/lookup.ts` |
| 6 | Cinco clientes Supabase creados en cinco lugares | `plugins/auth.ts`, `cacheService`, `savedProductsService`, `scanHistoryService`, `deleteMe` |
| 7 | Presentación del puntaje fuera del motor, con umbral propio | `productLookupService.ts · scorePresentation`, `flagged` |
| 8 | Native: pantallas que llaman a Supabase directo | 17 llamadas a `supabase.auth.*` + 3 a `profiles` (también lo marca `REFACTOR_PLAN.md` de native, A2) |

### 4.2 Dependencias circulares

- **0 ciclos** en server (madge, 66 archivos) y en native (madge, 82 archivos).
- **Ciclo latente esquivado a mano:** `productRowMapper.ts` existe solo porque `cacheService` ↔ `productLookupService` formarían un ciclo. Desaparece con la separación del ADR-0002.

### 4.3 Rutas sin auth o sin validación

| Ruta | Auth | Validación de entrada | Schema de respuesta |
|---|---|---|---|
| `POST /products/lookup` | Opcional (intencional) | ✅ (sin `additionalProperties:false`) | ✅ 200/404 |
| `GET /products/image` | **No** | **No** | No | 
| `DELETE /users/me` | ✅ | n/a | No |
| `GET /users/me/saved` | ✅ | n/a | No |
| `POST /users/me/saved` | ✅ | ✅ | No |
| `DELETE /users/me/saved/:id` | ✅ | ✅ | No |
| `GET /users/me/history` | ✅ | ✅ (rango en el handler) | No |
| `GET /health` | No (correcto) | n/a | No |

### 4.4 Secretos

| ID | Hallazgo | Severidad | Acción |
|---|---|---|---|
| **SEC-02** | `fitogenix-native/ENVIRONMENT.md` tiene en **texto plano** la secret key de Supabase de producción (acceso total a la base, saltea RLS), la de Anthropic y la de SerpAPI. No está versionado ni en el historial, pero es un archivo en disco pensado para leerse y compartirse. **Además, esas claves se imprimieron en la salida de esta sesión de auditoría** al buscar secretos (no quedaron en `docs/`: verificado) | **Crítica** | **Resuelto en parte (D-51):** archivo eliminado (movido a la Papelera). Las claves **no se rotan** (riesgo aceptado). Pendiente del usuario: vaciar la Papelera |
| SEC-03 | El `.env` local de native tiene `SUPABASE_SECRET_KEY`, `ANTHROPIC_API_KEY` y `SERPAPI_API_KEY`, que la app no usa | Media | Borrarlas del `.env` de native |
| SEC-04 | El server exige `ANTHROPIC_API_KEY` y `SERPAPI_API_KEY` para arrancar sin usarlas | Baja | D-05 |
| SEC-05 | La anon key de Supabase va embebida en la app; con SEC-01 abre el catálogo | Alta (hasta cerrar SEC-01) | SEC-01 + D-28 |
| SEC-06 | `eas.json` versiona el email personal de un colaborador (`appleId`) | Baja (dato personal) | Mover a config de EAS |
| — | **Historial de git limpio**: 0 claves y 0 archivos `.env` versionados en los dos repos, incluidas las ramas borradas (revisadas desde los bundles) | — | — |

### 4.5 Tests en las zonas de alto riesgo

| Zona | Cobertura hoy | Falta (paso 1 del plan) |
|---|---|---|
| **scoring** | Alta: 10 suites (`calibration`, `regression`, `invariants`, `robustness`, `rules`, `seals`, `ledger`, `cleaning`, `presentation`) | Caracterizar `presentScore` en cada borde de banda antes de mover el motor; fijar `flagged` actual para que su cambio (40 → banda) sea visible |
| **auth** (`plugins/auth.ts`) | **0 tests** | Sin header, `Bearer` vacío, token inválido, token vencido, token válido → `userId`; ruta pública sin el hook; y el aislamiento por `userId` en guardados e historial (RNF-S03) |
| Rutas `saved`, `history`, `deleteMe` | 0 tests de ruta (solo de servicio) | Tests con `app.inject()` de status y forma de respuesta |
| ETL `fetchRowsForBarcodes` | Tiene test, pero **no detecta la falta de paginación** | Test con más filas que el límite de PostgREST |

---

## 5. Reconciliación con `fitogenix-native/docs/REFACTOR_PLAN.md`

Native tiene su propio plan (2026-09-21, 8 fases). Coincide en el diagnóstico en varios puntos (eliminar cuenta roto, onboarding, pantallas que llaman a Supabase directo) y responde a sus "decisiones que necesito de vos":

| Pregunta del plan de native | Respuesta ya decidida acá |
|---|---|
| B1 · ¿Se restaura la persistencia del onboarding? | Sí (RNF-U08) |
| B2 · ¿Las respuestas del onboarding van al perfil en Supabase o se eliminan? | Ni una ni otra: van a una **tabla propia vía el server**, solo si se crea la cuenta, con consentimiento (D-20, D-27, RF-048) |
| B3 · ¿Existe un endpoint para eliminar la cuenta? | Sí: `DELETE /users/me` (`/v1/users/me`, D-44) |

Y hay tres puntos del plan de native que **contradicen** decisiones de este plan:

| Ítem de native | Choca con | Ajuste |
|---|---|---|
| A2 / Fase 4: crear una capa de servicios **sobre Supabase** en la app | **D-28** (la app no habla con Supabase) | La capa de servicios de native habla solo con el server |
| "`lib/contracts/product.ts` como fuente única del contrato" y T4.5 (migrar imports a ese archivo) | **ADR-0011** (tipos generados desde el OpenAPI del server) | El archivo se reemplaza por `src/api/schema.d.ts` generado |
| T4.1: `productImageUrl(url)` para `/products/image` | **D-49** (se elimina remove.bg) | La app usa `imageUrl` directo |

---

## 6. Resumen

1. **Requisitos:** de 45 filas, 14 implementados, 11 parciales, **12 inconsistentes**, 6 no implementados y 2 a eliminar.
2. **Los 12 inconsistentes** concentran los problemas reales: eliminar cuenta, onboarding, feedback y reportes simulados, Apple que no compila, teléfono perdido, 404 ante caídas, `flagged` e `id`, historial que vuelve, `/terms`, analítica y el **bug de paginación del ETL**.
3. **Código:** 12 ítems muertos en el server y 9 en native; 10 vivos pero mal ubicados; el motor, la mayoría de las rutas y la lógica de guardados e historial están bien, y solo cambian de carpeta.
4. **Documentación:** 18 afirmaciones desactualizadas en el server (README, `.env.example` y comentarios que describen la cascada, un "cold path" y una función que no existe) y 11 en native.
5. **Violaciones:** 30 de capas (dependency-cruiser) + 8 conceptuales; 0 ciclos (1 latente); `/products/image` sin auth ni validación; 6 de 8 rutas sin schema de respuesta.
6. **Secretos:** historial limpio en los dos repos; **SEC-02 crítico**: claves de producción en texto plano en `native/ENVIRONMENT.md`, que además pasaron por esta sesión. Recomiendo rotarlas.
7. **Tests:** el motor está bien cubierto; **auth no tiene ningún test**.
8. El plan de refactor de native se superpone con este y lo contradice en 3 puntos (Supabase en la app, contrato manual, imágenes).

## 7. Decisiones de la Fase 4 (2026-09-28)

| # | Tema | Decisión |
|---|---|---|
| D-51 | SEC-02 (`native/ENVIRONMENT.md` con claves en texto plano) | El archivo **se elimina ya**: se movió a la Papelera de macOS el 2026-09-28 (no estaba versionado; falta vaciar la Papelera). **Las claves no se rotan**: riesgo aceptado por el responsable del proyecto |
| D-52 | Dónde viven los documentos | `fitogenix-server/docs/` en el checkout principal, con un registro único de decisiones ([decisiones.md](decisiones.md)) |
| D-53 | Bug de paginación del ETL (RF-052) | **Se reaplica el arreglo** como ítem del plan. Patch preservado en [`raw/fix-paginacion-etl-6c4b561.patch`](raw/fix-paginacion-etl-6c4b561.patch) (se aplica limpio sobre `main`, verificado con `git apply --check`) |
| D-54 | `MOTOR_V21_INFORME.md` | **Se elimina**: el motor va a cambiar de nuevo (D-25) |
| D-55 | Plan de native (`REFACTOR_PLAN.md`) | El plan de la Fase 5 **incluye las tareas de native** que se desprenden de esta documentación (auth por el server, tipos generados, eliminar cuenta, imágenes, onboarding, etc.) y **actualiza `REFACTOR_PLAN.md`** con los 3 ajustes de §5 |

Sin preguntas pendientes.
