# Registro de decisiones

> Índice único de todas las decisiones tomadas durante la auditoría (2026-09-28). Cada fila apunta al documento donde está el detalle y el contexto.
> Las decisiones de arquitectura con alternativas y consecuencias están además en [`adr/`](adr/README.md). La deuda técnica diferida está en [`deuda-tecnica.md`](deuda-tecnica.md).
> **Cómo se mantiene:** una decisión nueva se agrega primero en el documento de su fase (o en un ADR) y después acá, con el siguiente número libre. Una decisión que cambia otra **no la edita**: se agrega una nueva que la reemplaza y se anota en la columna *Estado*.

| # | Tema | Decisión | Detalle en | Estado |
|---|---|---|---|---|
| D-01 | Base de la auditoría | Solo `main`, que es lo que corre en Render. Se borraron todas las demás ramas | [00-inventario.md](00-inventario.md) | Vigente |
| D-02 | Trabajo no mergeado (sello v2.4, fix de paginación del ETL, WIP de native) | Se descarta. No entra al backlog | [00-inventario.md](00-inventario.md) | Vigente, con dos excepciones posteriores: D-09 (se trae la migración 015) y D-53 (se reaplica el arreglo de paginación) |
| D-03 | fitogenix-native | Es el **cliente activo**, mobile (App Store / Google Play), sin publicar. No es código muerto | [00-inventario.md](00-inventario.md) | Vigente |
| D-04 | Deploy del server | Render: build `npm install && npm run build`, start `node dist/main.js`, Node "la del server" (hoy no declarada) | [00-inventario.md](00-inventario.md) | Vigente |
| D-05 | `ANTHROPIC_API_KEY` / `SERPAPI_API_KEY` | Salen del arranque del server; el server no hace requests directas a la IA | [00-inventario.md](00-inventario.md) | Vigente (ampliada por D-28) |
| D-06 | Commits | No se commitea nada hasta que estén completos el análisis y el plan (Fase 5) | [00-inventario.md](00-inventario.md) | Vigente |
| D-07 | Tablas `productos_validados`, `registro_controles`, `validation_runs` | Origen desconocido, candidatas a eliminación. Se eliminan en tres pasos (backup, revoke durante 2 semanas, DROP), nunca con DROP directo. Ítem **P1** del plan | [00-inventario.md](00-inventario.md) | Vigente |
| D-08 | Lectura pública del catálogo | No es intencional. El único acceso legítimo al catálogo es fitogenix-server con service role. Hallazgo **SEC-01, P0**; su fix entra al plan como **P0** | [00-inventario.md](00-inventario.md) | Vigente (ampliada por D-28 / ADR-0010) |
| D-09 | Migración `015` (aplicada en producción, código descartado) | Se trae al repo como `migrations/015_sello_comment_sin_umbrales.sql`, **sin tocar la base** (ya está aplicada). Por la regla "solo escribo en `docs/`" no se crea ahora: queda como ítem del plan (§7.3), con la copia textual en `docs/raw/` | [00-inventario.md](00-inventario.md) | Vigente |
| D-10 | Objetivos de performance y disponibilidad | Se validan: p95 barcode ≤ 300 ms con hit / ≤ 800 ms con miss, nombre ≤ 1 s, de punta a punta ≤ 2 s, disponibilidad mensual 99,5% | [01-requerimientos.md](01-requerimientos.md) | Vigente |
| D-11 | Hosting | Render plan **free** por ahora; es posible migrar a otro proveedor. La arquitectura no se tiene que atar a Render (se formaliza en un ADR en la Fase 2) | [01-requerimientos.md](01-requerimientos.md) | Vigente; se completa con D-18 |
| D-12 | Cobertura de puntaje | El 95% de los productos de las tablas tienen que poder calcularse (definición exacta en la sección 7) | [01-requerimientos.md](01-requerimientos.md) | Vigente |
| D-13 | Quitar del historial | Se agrega el endpoint `DELETE /users/me/history/:productId` (RF-017) | [01-requerimientos.md](01-requerimientos.md) | Vigente |
| D-14 | Guardar sin cuenta | El botón invita a crear una cuenta, con un mensaje claro de que sin cuenta no hay acceso al historial ni a los guardados | [01-requerimientos.md](01-requerimientos.md) | Vigente |
| D-15 | Feedback y reportes de producto | Endpoint dedicado en el server + almacenamiento en tabla | [01-requerimientos.md](01-requerimientos.md) | Vigente; alcance: D-21 y D-26 |
| D-16 | Alternativas y lectura de etiquetas | Buenas ideas, pero quedan fuera de alcance por ahora: hay que diseñarlas antes. Mientras tanto, el texto de la app no debe prometerlas | [01-requerimientos.md](01-requerimientos.md) | Vigente |
| D-17 | Teléfono | Se guarda en `profiles.phone` | [01-requerimientos.md](01-requerimientos.md) | Vigente; el *cómo* lo define D-46 (el server crea el perfil, sin trigger) |
| D-18 | Hosting vs. objetivos | Antes de publicar en las tiendas, el server corre en una instancia siempre encendida (del proveedor que sea). Hasta entonces, el p95 se mide sin contar los arranques en frío, que se informan aparte | [01-requerimientos.md](01-requerimientos.md) | Vigente |
| D-19 | Cobertura del 95% | Es **deuda técnica conocida**: muchos datos de la base están incompletos. La medición (con `scripts/score-histogram.ts`) se hace **después de limpiar los datos**. La definición de la sección 7.2 queda como definición de trabajo, a confirmar en ese momento. El saneamiento de datos entra al plan como ítem propio | [01-requerimientos.md](01-requerimientos.md) | Vigente; registrada como deuda técnica DT-02 |
| D-20 | Respuestas del onboarding | Se guardan **solo si el usuario crea una cuenta**: viven en la sesión de la app y, si se crea la cuenta, se persisten en una tabla; si no, se descartan (RF-048). Por los datos de salud aplica RNF-S10 | [01-requerimientos.md](01-requerimientos.md) | Vigente |
| D-21 | Feedback | Es importante **tenga o no cuenta** el usuario: el endpoint acepta anónimos y usuarios. Al ser público, necesita su propio rate limit y protección antispam | [01-requerimientos.md](01-requerimientos.md) | Vigente |
| D-22 | Texto que promete alternativas y lectura de etiquetas | **No se saca**: esas funcionalidades pasan a ser **objetivos del roadmap** (RF-060, RF-061), con diseño propio | [01-requerimientos.md](01-requerimientos.md) | Vigente; cuándo: D-24 |
| D-23 | Ubicación y Accesibilidad | Se quitan del perfil. La accesibilidad es un **requisito transversal** de toda la app (RNF-U11), no una función | [01-requerimientos.md](01-requerimientos.md) | Vigente |
| D-24 | Cuándo se hacen alternativas y lectura de etiquetas | **Antes de publicar en las tiendas, después de dejar limpia la codebase.** Hay otras prioridades antes, pero son requisito del lanzamiento. Orden macro: limpieza (este plan) → otras prioridades → RF-060 / RF-061 → publicación | [01-requerimientos.md](01-requerimientos.md) | Vigente |
| D-25 | Metales pesados | Se consideran y **ponderan en el puntaje**, como parte de la **refactorización del motor** (RF-062) | [01-requerimientos.md](01-requerimientos.md) | Vigente |
| D-26 | Reportes de producto | Se aceptan de todos (anónimos y usuarios), con la misma protección que el feedback | [01-requerimientos.md](01-requerimientos.md) | Vigente |
| D-27 | Respuestas del onboarding con registro por email | **Opción B** (sección 7.6): al tocar "registrarme" se guardan en el teléfono con vencimiento corto (24 h); se envían al server en el primer inicio de sesión y se borran del teléfono; también se borran al vencer o al elegir "continuar sin cuenta". Nunca llegan al server sin cuenta | [01-requerimientos.md](01-requerimientos.md) | Vigente |
| D-28 | Comunicación cliente ↔ backend | **El cliente no hace requests directas a Supabase: todo pasa por el server.** Afecta el *cómo* de RF-020 a RF-028 (registro, username, login con email / Google / Apple, recuperación de contraseña, sesión, perfil): el comportamiento esperado no cambia, pero native deja de llamar a Supabase y usa endpoints nuevos del server. Ver [ADR-0010](adr/0010-server-unica-puerta-de-entrada.md) y [02-arquitectura.md §7 y §9](02-arquitectura.md) | [01-requerimientos.md](01-requerimientos.md) | Vigente |
| D-29 |  | Validación local del JWT con JWKS; consulta extra a Supabase en `DELETE /users/me` (ADR-0008 aceptado) | [02-arquitectura.md](02-arquitectura.md) | Vigente |
| D-30 |  | Reenviar la IP real del usuario a Supabase Auth ("IP Address Forwarding") con `trustProxy` bien configurado (ADR-0010) | [02-arquitectura.md](02-arquitectura.md) | Vigente |
| D-31 |  | Se elimina `scripts/test-search-rpc.ts` | [02-arquitectura.md](02-arquitectura.md) | Vigente |
| D-32 | Listados vs. detalle | Los listados (`saved`, `history`) devuelven un **resumen**; al elegir un producto se pide el detalle con **`GET /products/:id`** (nuevo) | [03-contratos.md](03-contratos.md) | Vigente |
| D-33 | `aiEnriched` | No se le muestra al usuario: **sale del contrato**. La columna `ai_enriched` queda como dato interno del ETL (104 filas) | [03-contratos.md](03-contratos.md) | Vigente |
| D-34 | `transFat`, `cholesterol` | **Se muestran**: quedan en el contrato y native suma las dos filas | [03-contratos.md](03-contratos.md) | Vigente |
| D-35 | Columnas denormalizadas | Se **eliminan** `score`, `score_label`, `sello` y `engine_version` (+ su índice). Los scripts que las leen (`stats.ts`) pasan a recalcular, como ya hace `score-histogram.ts` | [03-contratos.md](03-contratos.md) | Vigente |
| D-36 | `nova_group` | Se **elimina** (columna, campo de `RawProduct` y de `ProductInput`): el motor no la usa desde v2.1 | [03-contratos.md](03-contratos.md) | Vigente |
| D-37 | Contenido neto | Se quiere mostrar el **contenido neto** y la **información nutricional del envase**, en lugar de "por 100 g". **Diferido (D-43):** queda como requisito (RF-063) para después del saneamiento del catálogo (D-42). **Hasta entonces el contrato sigue por 100 g/ml** | [03-contratos.md](03-contratos.md) | Diferida por D-43 |
| D-38 | `tagline` | **Se elimina** del contrato y de `presentScore`: ninguna pantalla lo usa. (No estaba en la base: se calculaba en vivo desde el puntaje. Si algún día se quiere mostrar, sale de la banda del puntaje en el momento, sin persistir nada) | [03-contratos.md](03-contratos.md) | Vigente |
| D-39 | Producto sin contenido neto | Se muestra la nutrición **por 100 g/ml, con la aclaración** | [03-contratos.md](03-contratos.md) | Vigente |
| D-40 | Multipacks ("6 x 200 ml") | Nutrición **por envase individual** | [03-contratos.md](03-contratos.md) | Vigente |
| D-41 | Restos de la búsqueda con IA | **Se eliminan** las 5 filas `data_source = 'ai'` (previa verificación de guardados/historial), la columna `name_key` con su UNIQUE, y `manufacturer_info` | [03-contratos.md](03-contratos.md) | Vigente |
| D-42 | Saneamiento del catálogo | La base tiene muchos errores y datos faltantes. Se va a tratar **en una sesión aparte, dedicada**, con el objetivo de **migrar a una tabla de productos limpia** (discrepancias y faltantes resueltos y validados). Es un proyecto propio: este plan solo registra sus dependencias (cobertura del 95% D-19, contenido neto D-43) | [01-requerimientos.md](01-requerimientos.md) | Vigente |
| D-43 | Contenido neto (D-37) | Queda como **requisito diferido** (RF-063): se piensa y se implementa después del saneamiento (D-42) | [01-requerimientos.md](01-requerimientos.md) | Vigente |
| D-44 | Versión de la API | **Todas las rutas llevan el prefijo `/v1`** (`/v1/products/lookup`, `/v1/auth/login`…). Excepción: `/health` y `/health/ready`, que no son parte del contrato con la app | [03-contratos.md](03-contratos.md) | Vigente |
| D-45 | Cache de Redis | **Se guardan los datos crudos** del producto (`RawProduct` + `id`), no la respuesta armada (B.4.1). Desaparece el sobre versionado por motor | [03-contratos.md](03-contratos.md) | Vigente |
| D-46 | Perfil | **El server crea el perfil** (con teléfono) al registrar; sin datos personales en la metadata del JWT; se elimina el trigger `handle_new_user` (B.4.6) | [03-contratos.md](03-contratos.md) | Vigente |
| D-47 | `isSaved` | Se incluye en `ProductDetail` cuando la request trae sesión | [03-contratos.md](03-contratos.md) | Vigente |
| D-48 | Límites por ruta | Se validan los de B.3 | [03-contratos.md](03-contratos.md) | Vigente (el límite de imágenes quedó sin efecto por D-49) |
| D-49 | Imágenes | **Se elimina remove.bg** y el endpoint `/products/image`. La app muestra las imágenes que ya vienen de VTEX y Open Food Facts (RF-008) | [01-requerimientos.md](01-requerimientos.md) | Vigente |
| D-50 | Hosting de imágenes | Queda como **deuda técnica** ([DT-04](deuda-tecnica.md)): evaluar un servicio externo que guarde las imágenes y las sirva siempre por HTTPS | [01-requerimientos.md](01-requerimientos.md) | Vigente |
| D-51 | SEC-02 (`native/ENVIRONMENT.md` con claves en texto plano) | El archivo **se elimina ya**: se movió a la Papelera de macOS el 2026-09-28 (no estaba versionado; falta vaciar la Papelera). **Las claves no se rotan**: riesgo aceptado por el responsable del proyecto | [04-analisis.md](04-analisis.md) | Vigente |
| D-52 | Dónde viven los documentos | `fitogenix-server/docs/` en el checkout principal, con un registro único de decisiones ([decisiones.md](decisiones.md)) | [04-analisis.md](04-analisis.md) | Vigente |
| D-53 | Bug de paginación del ETL (RF-052) | **Se reaplica el arreglo** como ítem del plan. Patch preservado en [`raw/fix-paginacion-etl-6c4b561.patch`](raw/fix-paginacion-etl-6c4b561.patch) (se aplica limpio sobre `main`, verificado con `git apply --check`) | [04-analisis.md](04-analisis.md) | Vigente |
| D-54 | `MOTOR_V21_INFORME.md` | **Se elimina**: el motor va a cambiar de nuevo (D-25) | [04-analisis.md](04-analisis.md) | Vigente |
| D-55 | Plan de native (`REFACTOR_PLAN.md`) | El plan de la Fase 5 **incluye las tareas de native** que se desprenden de esta documentación (auth por el server, tipos generados, eliminar cuenta, imágenes, onboarding, etc.) y **actualiza `REFACTOR_PLAN.md`** con los 3 ajustes de §5 | [04-analisis.md](04-analisis.md) | Vigente |
| D-56 | Carril U | Aprobado: U-01, U-02 y U-03 antes de la etapa 1 | [05-plan.md](05-plan.md) | Vigente |
| D-57 | Transición a `/v1` | Sin alias: todo a `/v1` de una vez | [05-plan.md](05-plan.md) | Vigente |
| D-58 | Consultas y migraciones en Supabase | Se entregan las queries y las corre el responsable | [05-plan.md](05-plan.md) | Vigente |
| D-59 | Estrategia de ramas | Integración `fitogenix/refactor-cleanup` desde `main` en ambos repos; features → integración → `main` al final | [05-plan.md](05-plan.md) | Vigente |

## Decisiones de arquitectura (ADRs)

| ADR | Título | Estado |
|---|---|---|
| [0001](adr/0001-monolito-modular.md) | Monolito modular con módulos por capacidad | Propuesto |
| [0002](adr/0002-capas-y-cableado.md) | Capas por módulo, puertos y cableado sin contenedor de DI | Propuesto |
| [0003](adr/0003-scoring-dominio-puro.md) | Scoring como dominio puro y única fuente de presentación del puntaje | Propuesto |
| [0004](adr/0004-etl-fuera-del-runtime.md) | El ETL fuera del runtime, con config propia | Propuesto |
| [0005](adr/0005-acceso-a-datos-y-propiedad-de-tablas.md) | Propiedad de tablas y acceso a Supabase por actor | Propuesto (revisado por 0010) |
| [0006](adr/0006-fallas-de-dependencias.md) | Timeouts, errores de dependencias y health | Propuesto |
| [0007](adr/0007-portabilidad-de-hosting.md) | Portabilidad de hosting | Propuesto |
| [0008](adr/0008-validacion-de-jwt.md) | Validación del JWT: local con JWKS vs. `getUser` | **Aceptado** (D-29) |
| [0009](adr/0009-migraciones.md) | Un solo mecanismo de migraciones + baseline | Propuesto |
| [0010](adr/0010-server-unica-puerta-de-entrada.md) | El server como única puerta de entrada del cliente | Propuesto (D-28) |
| [0011](adr/0011-contrato-http-fuente-unica.md) | El contrato HTTP como fuente única: TypeBox → OpenAPI → tipos del cliente | Propuesto |
