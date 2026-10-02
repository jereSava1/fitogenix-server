# Requerimientos

Qué tiene que hacer Fitogenix (server + app). Las rutas son las del contrato [`contract/openapi.json`](../contract/openapi.json); el detalle de cada endpoint está ahí.

**Estado:** ✅ cumple · ⚠ parcial · ⏳ falta, antes de publicar en las tiendas · 🗺 roadmap, con diseño propio pendiente.

## Actores

| Actor | Quién es | Cómo accede |
|---|---|---|
| Anónimo | Usa la app sin cuenta ("Continuar sin cuenta") | App → server, sin token |
| Usuario | Tiene cuenta (email, Google o Apple) | App → server con `Authorization: Bearer <JWT>` |
| Operador de datos | Corre el ETL que carga el catálogo | `npm run etl:*`, con credenciales de servicio |

La app habla **solo** con el server (D-28). El server usa Supabase (base y Auth) y Upstash Redis (cache).

## Requerimientos funcionales

### Catálogo

| ID | Requisito | Criterio | Estado |
|---|---|---|---|
| RF-001 | Buscar por **código de barras** | `POST /v1/products/lookup` con 8 a 14 dígitos → 200 con el producto; el puntaje se recalcula con el motor vigente | ✅ |
| RF-002 | Buscar por **nombre** | Texto de 3+ caracteres (normalizado) → el producto más parecido (similitud trigram); con menos, no encontrado | ✅ |
| RF-003 | Informar que **no está en el catálogo** | Sin match → 404, sin consultar proveedores externos | ✅ |
| RF-004 | Validar la entrada | `query` vacía, de más de 200 caracteres o con caracteres de control → 400 | ✅ |
| RF-005 | Mostrar **puntaje y explicación** | Puntaje 0–100 o `null` con `noScore` (código y motivo); banda, ingredientes con severidad y nutrición por 100 g/ml con nulos explícitos | ✅ |
| RF-006 | **Registrar el escaneo** con sesión | Lookup con token válido → upsert en el historial en segundo plano; no demora ni rompe la respuesta; un token inválido sigue como anónimo | ✅ |
| RF-008 | Mostrar la **imagen** del producto | La app carga `imageUrl` directo de la fuente; sin imagen o si falla, placeholder propio. El server no procesa imágenes | ✅ |
| RF-009 | Ver el **detalle** de un producto por id | `GET /v1/products/{id}` → el mismo detalle que el lookup; id inexistente → 404 | ✅ |
| RF-063 | Contenido neto y nutrición **por envase** | Se diseña después del catálogo confiable ([06-catalogo-confiable.md](06-catalogo-confiable.md)) | 🗺 |

### Biblioteca del usuario

| ID | Requisito | Criterio | Estado |
|---|---|---|---|
| RF-010 | Listar **guardados** | `GET /v1/users/me/saved` → del más reciente al más viejo, con fecha de guardado | ✅ |
| RF-011 | **Guardar** | `POST /v1/users/me/saved` → idempotente; producto inexistente → 404 | ✅ |
| RF-012 | **Quitar** un guardado | `DELETE /v1/users/me/saved/{productId}` → idempotente | ✅ |
| RF-013 | Listar **historial** | `GET /v1/users/me/history?limit=n` → un ítem por producto, más reciente primero, con fecha; `limit` 1..50, default 20 | ✅ |
| RF-014 | **Pasar el historial anónimo** a la cuenta | Al iniciar sesión sin cerrar la app, se re-emiten los lookups de la sesión con token (hasta 20). Si se cerró la app, se pierde | ✅ |
| RF-017 | **Borrar** un ítem del historial | `DELETE /v1/users/me/history/{productId}` → idempotente; no vuelve al sincronizar. Sin sesión, el historial vive en memoria y se borra local | ✅ |

### Cuenta

| ID | Requisito | Criterio | Estado |
|---|---|---|---|
| RF-020 | **Registrarse** con email | `POST /v1/auth/signup` con email, contraseña, nombre, apellido, username y teléfono → cuenta pendiente de confirmar el email; el perfil queda completo, con teléfono | ⚠ Funciona, pero el mail de confirmación solo llega al dueño hasta tener SMTP propio (L-03) |
| RF-021 | Ver si el **username** está libre | `GET /v1/auth/username-availability`; con "ocupado" no se puede seguir | ✅ |
| RF-022 | Iniciar sesión con **email** | `POST /v1/auth/login` | ✅ |
| RF-023 | Iniciar sesión con **Google** | `POST /v1/auth/oauth/google` con el idToken | ✅ |
| RF-024 | Iniciar sesión con **Apple** | `POST /v1/auth/oauth/apple` con idToken y nonce | ⚠ Falta configurar Apple (Client IDs y capability) |
| RF-025 | **Recuperar la contraseña** | `POST /v1/auth/password/forgot` manda un código (202 aunque el email no exista); `/reset` lo canjea por la contraseña nueva | ⚠ Mismo límite de SMTP que RF-020 |
| RF-026 | Usar la app **sin cuenta** | "Continuar sin cuenta" entra a las tabs hasta reiniciar la app o cerrar sesión | ✅ |
| RF-027 | **Cerrar sesión** | `POST /v1/auth/logout`; la app borra los datos locales y vuelve a la bienvenida. La sesión se renueva con `/v1/auth/refresh` | ✅ |
| RF-028 | Ver y editar **datos personales** | `GET` / `PATCH /v1/users/me/profile`; username repetido → 409 | ✅ |
| RF-029 | **Eliminar la cuenta** | `DELETE /v1/users/me` borra el usuario y, en cascada, perfil, guardados, historial y respuestas del onboarding | ✅ |
| RF-030 | **Exigir sesión** en las rutas privadas | `/v1/users/me*` sin token o con token inválido → 401; toda consulta se filtra por el usuario del token | ✅ |

### Onboarding, contenido y soporte

| ID | Requisito | Criterio | Estado |
|---|---|---|---|
| RF-040 | **Onboarding** en el primer uso | Se muestra solo en el primer arranque | ✅ |
| RF-041 | **Guía** de uso | Contenido estático, armado con las bandas del contrato | ✅ |
| RF-042 | **Ayuda y soporte** | Mails de soporte; enlaces a Privacidad y Términos (en la web) | ✅ |
| RF-043 | Mandar **feedback** | `POST /v1/feedback`, con o sin sesión; "enviado" solo con 2xx | ✅ |
| RF-044 | **Reportar un problema** con un producto | `POST /v1/products/{productId}/reports`, con o sin sesión | ✅ |
| RF-045 | Ver la **política de privacidad** | Pantalla en la app y página en la web | ⚠ La web todavía dice que no se recopilan datos de salud (L-07) |
| RF-047 | Medir los **escaneos fallidos** | Evento `scan_failed` (fuera de catálogo vs. error) | ⚠ Se emite pero no tiene destino ([DT-05](deuda-tecnica.md)) |
| RF-048 | Guardar las **respuestas del onboarding** solo si se crea la cuenta | Con cuenta → `POST /v1/users/me/onboarding`. Con registro por email quedan en el teléfono hasta 24 h y se mandan en el primer login (D-27). Sin cuenta se descartan | ✅ |
| RF-060 | Recomendar **alternativas** mejores | — | 🗺 Antes de publicar (D-24) |
| RF-061 | Leer ingredientes desde una **foto** de la etiqueta | — | 🗺 Antes de publicar (D-24) |
| RF-062 | **Metales pesados** en el puntaje | Pondera en el puntaje; criterio y peso en el diseño del motor | 🗺 Antes de publicar (D-25) |

### Operación

| ID | Requisito | Criterio | Estado |
|---|---|---|---|
| RF-050 | **Health check** | `GET /health` → 200 si el proceso responde. `GET /health/ready` → 503 si Supabase no contesta en 1 s (Redis se informa, no bloquea) | ✅ |
| RF-051 | **Ingesta** de fuentes | `etl:off` (Open Food Facts) y `etl:vtex` (supermercados) → `products_staging` | ✅ |
| RF-052 | **Merge** al catálogo | `etl:merge` agrupa por código, aplica la regla de completitud y escribe en `products` | ✅ |
| RF-053 | **Calidad de datos** | `etl:audit-quality`, `etl:fix-quality` (dry run por default), `etl:check-dupes`, `etl:completeness`, `etl:stats` | ✅ |
| RF-054 | **Enriquecer** imágenes e ingredientes | `etl:images`, `etl:enrich-cencosud` | ✅ |

IDs retirados: RF-007 (imagen sin fondo, D-49), RF-015 (reemplazado por RF-017), RF-016 (migración de guardados locales), RF-046 (Ubicación, D-23).

## Requerimientos no funcionales

### Usabilidad

| ID | Requisito | Métrica | Estado |
|---|---|---|---|
| RNF-U01 | "No está en el catálogo" y "error" se distinguen | 404 → cartel de fuera de catálogo, sin reintentar; fallo de red o 5xx → error con "reintentar" | ✅ |
| RNF-U02 | Feedback inmediato al leer un código | Vibración + carga en < 100 ms | ✅ |
| RNF-U03 | **Cobertura de puntaje** | ≥ 95 % de `products` con puntaje al recalcular, sin contar los fuera de alcance (D-12) | ⏳ Sin medir; depende del catálogo confiable |
| RNF-U04 | Tasa de "fuera de catálogo" medible | Tasa semanal sobre escaneos reales | ⏳ Depende de RF-047 |
| RNF-U05 | Guardar sin cuenta invita a crear una | Ningún guardado "fantasma" sin sesión (D-14) | ✅ |
| RNF-U06 | El ícono de guardado refleja el server | Coincide con `GET /v1/users/me/saved` | ✅ |
| RNF-U07 | Un ítem borrado del historial no vuelve | — | ✅ |
| RNF-U08 | El onboarding no se repite | Solo en el primer arranque | ✅ |
| RNF-U09 | La app no promete funciones que no tiene | — | ⚠ Promete foto de etiqueta, alternativas y metales pesados: se aceptó como roadmap (D-22) |
| RNF-U10 | Límite de espera con red lenta | Timeout del cliente con mensaje accionable | ✅ |
| RNF-U11 | **Accesibilidad**: respeta la configuración del sistema | Etiqueta en todo control de solo ícono; texto hasta 200 % sin cortarse; sin animaciones de deslizamiento con "reducir movimiento"; contraste AA | ⚠ Falta el [checklist manual](checklist-accesibilidad.md) y el contraste |

### Performance

| ID | Requisito | Métrica (D-10) | Estado |
|---|---|---|---|
| RNF-P01 | Lookup por código | p95 ≤ 300 ms con hit de Redis, ≤ 800 ms sin hit | ⏳ Sin medir (L-08) |
| RNF-P02 | Lookup por nombre | p95 ≤ 1 s | ⏳ Sin medir |
| RNF-P03 | Del escaneo a la pantalla | p95 ≤ 2 s en 4G | ⏳ Sin medir |
| RNF-P04 | Guardados e historial | p95 ≤ 800 ms con ≤ 50 ítems | ⏳ Sin medir |
| RNF-P05 | Sin arranque en frío visible | Primera request ≤ 2 s | ⏳ Necesita instancia siempre encendida (D-18, L-01); hasta entonces los arranques en frío se miden aparte |
| RNF-P06 | Una sola resolución por producto pedido a la vez | 1 consulta a la base por clave concurrente | ✅ |

### Disponibilidad

| ID | Si falla… | Respuesta | Estado |
|---|---|---|---|
| RNF-D01 | Redis | El lookup sigue desde Supabase; tope de 200 ms, sin reintentos | ✅ |
| RNF-D02 | Supabase (base) | 503 con `Retry-After`, nunca 404; tope de 2 s | ✅ |
| RNF-D03 | Supabase Auth | El JWT se valida local con las claves en cache; sin claves → 503. El lookup sigue como anónimo | ✅ |
| RNF-D05 | Cualquier dependencia crítica | `/health/ready` lo refleja | ✅ |
| RNF-D06 | Proveedores externos (OFF, IA, supermercados) | No afectan al server: solo los usa el ETL | ✅ |
| RNF-D07 | Objetivo global | Disponibilidad mensual del lookup ≥ 99,5 % | ⏳ Sin monitoreo (L-08) |

### Seguridad

| ID | Requisito | Métrica | Estado |
|---|---|---|---|
| RNF-S01 | El catálogo no se lee con la anon key | 0 filas en las pruebas negativas (D-08) | ✅ |
| RNF-S02 | Rutas privadas con sesión | 100 % de `/v1/users/me*` con auth | ✅ |
| RNF-S03 | Un usuario no ve datos de otro | Toda consulta filtrada por el usuario del token (el server usa service role: ese filtro es la única barrera) | ✅ |
| RNF-S04 | Límite de requests | 60/min por IP global; 10/min en `/auth/*`; 5 códigos fallidos por email cada 15 min; 5/min en feedback y reportes | ⚠ En memoria, por instancia: alcanza mientras haya una sola |
| RNF-S06 | CORS | Lista explícita (`CORS_ORIGINS`); vacía = sin CORS | ✅ |
| RNF-S07 | Cada proceso tiene solo sus secretos | El server no necesita claves de IA; ninguna clave secreta en `EXPO_PUBLIC_*` | ✅ |
| RNF-S08 | Eliminar la cuenta borra los datos personales | Cascada completa (RF-029); requisito de App Store | ✅ |
| RNF-S09 | Logs sin tokens ni datos personales | 0 headers `Authorization` en logs | ✅ |
| RNF-S10 | **Datos de salud** del onboarding | Solo con consentimiento explícito (fecha y versión del texto), borrables, informados en la política; nunca en la metadata de Auth. Ley 25.326 | ⚠ Server y app listos; falta la política de la web (L-07) |

IDs retirados: RNF-P07, RNF-D04 y RNF-S05 (los tres por la eliminación de `/products/image`, D-49).

## Pendiente antes de publicar en las tiendas

| ID | Qué |
|---|---|
| L-01 | Instancia siempre encendida (RNF-P05) |
| L-03 | SMTP propio en Supabase Auth: sin esto, el registro con email no funciona para nadie más que el dueño |
| L-04 | Alternativas (RF-060) y lectura de etiquetas (RF-061) |
| L-05 | Metales pesados en el motor (RF-062) |
| L-06 | Catálogo confiable y cobertura ≥ 95 % (RNF-U03, [06-catalogo-confiable.md](06-catalogo-confiable.md)) |
| L-07 | Política de privacidad de la web actualizada (RNF-S10) |
| L-08 | Medir el p95 y monitorear la disponibilidad |
| L-09 | Destino de la analítica ([DT-05](deuda-tecnica.md)) |
| L-10 | Hosting propio de imágenes por HTTPS ([DT-04](deuda-tecnica.md)) |
