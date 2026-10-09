# Decisiones

Una línea por decisión. Las de arquitectura, con contexto y alternativas, están en [`adr/`](adr/README.md).

**Estado:** **Vigente** = regla que se sigue aplicando · **Hecha** = acción puntual ya ejecutada · **Pendiente** = decidida y sin implementar · **Reemplazada** = ver la que la reemplaza.

Una decisión nueva toma el siguiente número libre (**D-103**). Si cambia otra, no se edita la vieja: se marca *Reemplazada por D-xx*.

| # | Decisión | Estado |
|---|---|---|
| D-01 | La auditoría se hizo sobre `main`; se borraron las demás ramas | Hecha |
| D-02 | El trabajo sin mergear de esa fecha se descartó (salvo D-09 y D-53) | Hecha |
| D-03 | fitogenix-native es el cliente activo (iOS y Android, sin publicar) | Vigente |
| D-04 | Render construye con `npm install && npm run build` y arranca con `node dist/main.js` | Reemplazada por D-93 |
| D-05 | El server no usa claves de IA ni de SerpAPI: solo el ETL | Vigente |
| D-06 | Sin commits hasta cerrar el análisis y el plan | Hecha |
| D-07 | Las tablas de validación sin dueño se eliminan en tres pasos: backup, sin acceso, `DROP` | Hecha (plazo según D-89) |
| D-08 | El catálogo solo lo lee el server con service role; nada con la anon key | Vigente |
| D-09 | La migración `015`, aplicada en producción, se trajo al repo sin tocar la base | Hecha |
| D-10 | Objetivos: p95 por código ≤ 300 ms con hit / ≤ 800 ms sin hit, por nombre ≤ 1 s, de punta a punta ≤ 2 s, disponibilidad 99,5 % | Vigente |
| D-11 | Render free por ahora; la arquitectura no se ata a Render ([ADR-0007](adr/0007-portabilidad-de-hosting.md)) | Vigente |
| D-12 | El 95 % del catálogo tiene que tener puntaje, sin contar los fuera de alcance | Vigente |
| D-13 | Existe `DELETE /v1/users/me/history/{productId}` | Hecha |
| D-14 | Guardar sin cuenta invita a crear una y explica que sin cuenta no hay historial ni guardados | Vigente |
| D-15 | Feedback y reportes van a un endpoint del server y se guardan en tablas | Hecha |
| D-16 | Alternativas y lectura de etiquetas quedan fuera de alcance hasta diseñarlas | Reemplazada por D-22 |
| D-17 | El teléfono se guarda en `profiles.phone` | Vigente |
| D-18 | Antes de publicar, el server corre en una instancia siempre encendida; hasta entonces el p95 se mide sin los arranques en frío | Vigente |
| D-19 | La cobertura del 95 % se mide después de sanear el catálogo | Vigente |
| D-20 | Las respuestas del onboarding se guardan solo si el usuario crea la cuenta; si no, se descartan | Vigente |
| D-21 | El feedback se acepta con o sin cuenta, con rate limit propio | Vigente |
| D-22 | El texto que promete alternativas y lectura de etiquetas se queda: pasan al roadmap (RF-060, RF-061) | Vigente |
| D-23 | Ubicación y Accesibilidad salen del perfil; la accesibilidad es un requisito transversal (RNF-U11) | Hecha |
| D-24 | Alternativas y lectura de etiquetas se hacen antes de publicar, después de la limpieza | Vigente |
| D-25 | Los metales pesados ponderan en el puntaje, como parte del rediseño del motor | Pendiente |
| D-26 | Los reportes de producto se aceptan con o sin cuenta, con la misma protección que el feedback | Vigente |
| D-27 | Con registro por email, las respuestas del onboarding esperan en el teléfono hasta 24 h y se mandan en el primer login | Vigente (el cuándo lo ajusta D-86) |
| D-28 | La app no habla con Supabase: todo pasa por el server ([ADR-0010](adr/0010-server-unica-puerta-de-entrada.md)) | Vigente |
| D-29 | El JWT se valida localmente con JWKS; `DELETE /v1/users/me` además consulta a Supabase ([ADR-0008](adr/0008-validacion-de-jwt.md)) | Vigente |
| D-30 | El server le pasa a Supabase Auth la IP real del usuario (`Sb-Forwarded-For`) | Vigente |
| D-31 | Se eliminó `scripts/test-search-rpc.ts` | Hecha |
| D-32 | Los listados devuelven un resumen; el detalle se pide con `GET /v1/products/{id}` | Vigente |
| D-33 | `ai_enriched` es un dato interno del ETL: no va en el contrato | Vigente |
| D-34 | Grasas trans y colesterol se muestran | Vigente |
| D-35 | Se eliminaron las columnas de puntaje guardado (`score`, `score_label`, `sello`, `engine_version`): el puntaje siempre se recalcula | Hecha |
| D-36 | Se eliminó `nova_group`: el motor no lo usa | Hecha |
| D-37 | Se quiere mostrar contenido neto y nutrición por envase | Pendiente (D-43) |
| D-38 | Se eliminó `tagline` del contrato | Hecha |
| D-39 | Sin contenido neto, la nutrición se muestra por 100 g/ml con la aclaración | Pendiente (D-43) |
| D-40 | En los multipacks, la nutrición es por envase individual | Pendiente (D-43) |
| D-41 | Se eliminaron los restos de la búsqueda con IA (filas `ai`, `name_key`, `manufacturer_info`) | Hecha |
| D-42 | El catálogo se sanea en un trabajo propio | Reemplazada por D-92 |
| D-43 | El contenido neto (D-37) se hace después de sanear el catálogo (RF-063) | Vigente |
| D-44 | Todas las rutas llevan `/v1`, salvo `/health` y `/health/ready` | Vigente |
| D-45 | Redis guarda los datos crudos del producto, no la respuesta armada | Vigente |
| D-46 | El server crea el perfil al registrar; sin datos personales en la metadata del JWT; sin trigger `handle_new_user` | Vigente |
| D-47 | `ProductDetail` trae `isSaved` cuando hay sesión | Pendiente |
| D-48 | Límites por ruta del contrato (los valores están en RNF-S04) | Vigente |
| D-49 | Sin remove.bg ni `/products/image`: la app muestra la imagen de la fuente | Hecha |
| D-50 | El hosting propio de imágenes queda como deuda ([DT-04](deuda-tecnica.md)) | Vigente |
| D-51 | Se eliminó el archivo de native con claves en texto plano | Hecha |
| D-52 | La documentación vive en `fitogenix-server/docs/`, con un solo registro de decisiones | Vigente |
| D-53 | Se reaplicó el arreglo de paginación del ETL | Hecha |
| D-54 | Se eliminó `MOTOR_V21_INFORME.md` | Hecha |
| D-55 | El plan general incluía las tareas de native | Hecha |
| D-56 | Los urgentes (U-01 a U-03) se hicieron antes que el resto | Hecha |
| D-57 | El paso a `/v1` fue de una vez, sin alias | Hecha |
| D-58 | Las consultas y migraciones de Supabase las corre el responsable | Vigente |
| D-59 | El refactor se integró en `fitogenix/refactor-cleanup` y pasó a `main` al final | Hecha |
| D-60 | Los default privileges de `public` no le dan nada a `anon` | Hecha |
| D-61 | La analítica se difiere; cuando se retome, va a un endpoint propio `POST /v1/events` ([DT-05](deuda-tecnica.md)) | Pendiente |
| D-62 | Las bandas del puntaje las define el server; la app no las transcribe | Vigente (el mecanismo lo define D-63) |
| D-63 | Las bandas se publican en `contract/scoring-bands.json` y la app las genera, igual que los tipos | Vigente |
| D-64 | Los PDFs de las normas no se versionan: se citan por su identificador oficial | Vigente |
| D-65 | Se eliminaron las escrituras sin uso de `catalog` | Hecha |
| D-66 | Se eliminó el código sin uso del ETL | Hecha |
| D-67 | La etapa 5 se hizo antes que la baseline de migraciones | Hecha |
| D-68 | ADR-0011 aceptado | Hecha |
| D-69 | El rate limit responde 429; el 400 de validación tiene un mensaje fijo en español y el detalle va al log; `ErrorCode` solo tiene los códigos que se usan | Vigente |
| D-70 | Los campos de más en bodies y querystrings se rechazan con 400 | Vigente |
| D-71 | Sin puntaje, `highlight` es `'ninguno'`; con puntaje, `'cuestionables'` por debajo de Buena y `'beneficiosos'` desde ahí | Vigente |
| D-72 | Native copia `openapi.json` de un checkout vecino del server (`contract:sync`) y verifica en su CI que esté al día | Vigente |
| D-73 | Sin puntaje, la pantalla muestra primero los ingredientes beneficiosos y el `noScore.message` del server; placeholder de imagen genérico | Vigente |
| D-74 | El explicador del puntaje y la guía usan texto provisorio, a revisar por UX; los datos de las bandas salen del contrato | Vigente |
| D-75 | Sesión: se exige `Bearer <token>`; Auth caído → 503; en el lookup, un token inválido busca como anónimo y no registra el escaneo | Vigente |
| D-76 | La invitación a crear cuenta es una alerta nativa con copy provisorio que lleva a `/welcome` | Vigente |
| D-77 | Se actualizó `fastify` por los avisos de `npm audit` | Hecha |
| D-78 | El proxy de confianza se configura por dirección (`TRUST_PROXY`); en Render, `10.0.0.0/8` | Vigente |
| D-79 | `forgot` responde 202 aunque el email no exista (503 si Auth no responde); `reset` responde 200; el código tiene de 6 a 10 dígitos | Vigente |
| D-80 | En el onboarding, el producto de ejemplo malo muestra 18 ("Malo") | Vigente |
| D-81 | La base cambia solo con migraciones de `supabase/migrations/` y `supabase db push`; `waitlist` solo admite `INSERT` | Vigente |
| D-82 | Feedback y reportes: se borran con la cuenta; antispam = 5/min por IP y validación, sin captcha; `status` `open` o `closed` | Vigente |
| D-83 | Onboarding: síntomas, dietas y alergias exigen consentimiento (también en la base); una fila por usuario | Vigente |
| D-84 | Registro: el username se valida antes de crear el usuario; un email sin confirmar es el mismo usuario | Vigente |
| D-85 | Sesión: un solo flujo para todos los proveedores; Google y Apple crean el perfil en el primer login; logout cierra solo este dispositivo | Vigente |
| D-86 | El consentimiento de salud se pide en el onboarding, nunca premarcado; las respuestas se guardan en el teléfono recién con la cuenta creada | Vigente |
| D-87 | Native: los tokens van al llavero; el access token se renueva al usarlo; cerrar sesión borra local al instante | Vigente |
| D-88 | `audit-scores` usa el veredicto de procesamiento del motor en vez de NOVA | Vigente |
| D-89 | El plazo sin acceso de las tablas de validación se acortó a un día | Hecha |
| D-90 | `anon` y `authenticated` no tienen permisos sobre los datos de usuario: todo pasa por el server | Vigente |
| D-91 | Aviso legal en capas (casilla obligatoria con email; "Al continuar aceptás…" con Google y Apple; línea al pie del resultado), con links a la web | Vigente |
| D-92 | No se cambian puntajes hasta tener un catálogo verificado y con fuente; ningún dato inventado por IA ([06-catalogo-confiable.md](06-catalogo-confiable.md)) | Vigente |
| D-93 | Render sigue con el build de Node: no deja cambiar el runtime de un servicio existente. Docker se usa en local y en el CI ([deploy.md](deploy.md)) | Vigente |
| D-94 | Tabla nutricional: calorías, proteínas, carbohidratos y grasas totales siempre ("sin dato" si falta); el resto, solo si es mayor que cero (RF-064) | Pendiente |
| D-95 | Los datos de un producto se validan contra la etiqueta o una fuente de la marca; la única revisión manual es la de un conjunto acotado de productos de control ([06-catalogo-confiable.md](06-catalogo-confiable.md)) | Vigente |
| D-96 | Una IA puede transcribir fotos de etiqueta publicadas (OFF, supermercados): copia lo que dice la foto, sin completar, y cuenta como fuente de etiqueta. Cada transcripción se hace dos veces y pasa controles automáticos ([06-catalogo-confiable.md](06-catalogo-confiable.md) §6b) | Vigente |
| D-97 | Se confía en el dato que aportó Guille para los dos casos de sodio: Tonadita `7798060850026` son 200 mg/100 g (la base ya tiene 0,2 g) y Doritos `7790310983737` son 672 mg/100 g (la base tiene 0,664 g y pasa a 0,672 g) | Pendiente (Doritos se corrige en la purga) |
| D-98 | Un dato es `verificado` cuando hay una fuente de etiqueta o de marca, con identidad confirmada, que pasa los controles, y ninguna fuente la contradice. La doble transcripción controla la lectura y no cuenta como segunda fuente. Resuelve la contradicción entre §3 y §6b de [06-catalogo-confiable.md](06-catalogo-confiable.md) | Vigente |
| D-99 | El parseo de ingredientes (`scoring/domain/cleaning.ts`) se arregla aunque cambien los puntajes: corrige la lectura, no el criterio. Es una excepción acotada a D-92, con informe de puntajes antes y después ([plan-accion-catalogo.md](plan-accion-catalogo.md)) | Hecha |
| D-100 | Las filas vacías de `products` (59.893 al 2026-10-08) se quedan: tienen código, nombre, marca e imagen, y son la cola de lo que hay que verificar | Vigente |
| D-101 | La categoría no se muestra en la app por ahora. El prototipo `scripts/preview-product-categories.ts` no se incorpora | Vigente |
| D-102 | Los códigos de barras inválidos de `products` se verifican contra la fuente: el UPC-A con el cero inicial recortado se corrige completando ceros hasta 13 dígitos si el verificador valida y la fuente lo confirma; se borra solo lo que la fuente no permite recuperar y nadie referencia. Nunca se calcula un dígito | Hecha |
