# U-01 · Cerrar el catálogo a la anon key

Fix de **SEC-01** (D-08, RNF-S01, ADR-0005, ADR-0010). Ítem U-01 de [`05-plan.md`](../../05-plan.md). Lo corre el responsable del proyecto en el SQL Editor de Supabase y devuelve los resultados (D-58).

| Archivo | Qué hace | Escribe |
|---|---|---|
| [`1-verificacion.sql`](1-verificacion.sql) | Seis consultas cortas (1A a 1F): permisos, policies, funciones, vistas, default privileges y 4 productos al azar para el smoke | No |
| [`2-cambio.sql`](2-cambio.sql) | Borra la policy pública; `REVOKE` de `anon`, `authenticated` y `PUBLIC` sobre `products` y `products_staging`; `REVOKE EXECUTE` de `search_products_by_name` para los mismos; `GRANT EXECUTE` explícito a `service_role`. Una sola transacción que se verifica a sí misma al final: si algo no quedó bien, aborta y no aplica nada | Sí |
| [`3-rollback.sql`](3-rollback.sql) | Vuelve exactamente al estado anterior (incluida la exposición). Solo si falla el smoke del server | Sí |

**Qué no toca:** `profiles` e `is_username_available` (native los usa hasta F-12; se cierran en B-03) ni los default privileges de `public` (D-60, se resuelven en C-05).

## Probado localmente (2026-09-28)

En un Postgres 15 local con los roles de Supabase simulados (`anon`, `authenticated`, `service_role` con `BYPASSRLS`, `authenticator` que hace `SET ROLE` como PostgREST, y los default privileges de `public` de Supabase):

| Prueba | Resultado |
|---|---|
| Antes del cambio | `anon` lee 50/50 filas de `products`, 0 de `products_staging` (RLS sin policies) y la RPC devuelve 5: reproduce SEC-01 |
| Después del cambio | `anon` y `authenticated`: `permission denied` en las tres. `service_role` sigue leyendo, escribiendo y llamando la RPC |
| Correrlo dos veces | Idempotente (solo un `NOTICE` porque la policy ya no existe) |
| `service_role` con `EXECUTE` solo vía `PUBLIC` | Lo conserva: el `GRANT` explícito está antes del chequeo |
| Un chequeo que falla | Aborta con `U-01: …`; la policy y los permisos de `anon` quedan como estaban |
| Rollback | La verificación 1A a 1E da **idéntica** a la de antes |

Lo que no se pudo probar acá: PostgREST real (códigos HTTP), Postgres 17 (producción es 17.6; el privilegio `MAINTAIN` solo existe desde la 17, así que las líneas que lo nombran se ajustaron después de la verificación de producción sin probarlas localmente) y el server en Render. Para eso están las pruebas P y S de abajo.

## Procedimiento

Cada consulta o script se pega **solo**, en una pestaña nueva del SQL Editor, y se corre **sin texto seleccionado** (con una selección, Supabase corre solo eso).

| Paso | Qué | Resultado esperado | Si no da eso |
|---|---|---|---|
| 0 | Confirmar V-03 (nadie usa un build viejo de la app que lea `products` directo) y que el ETL no esté corriendo | — | Esperar |
| 1 | Consultas 1A a 1F, una por vez. **Guardar las salidas** (son la foto de "antes") | Columna **Antes** de la tabla de abajo | **Parar** y pasarme las salidas |
| 2 | P-01, P-02 y P-03 (abajo) | P-01 y P-03: `HTTP 200` con filas. P-02: `HTTP 200` y `[]` | Pasarme la salida |
| 3 | S-01 y S-02 con las filas 1 y 2 de la 1F | `HTTP 200` en las dos | Parar: el server ya falla sin el cambio |
| 4 | `2-cambio.sql` entero | `Success. No rows returned` | `lock timeout`: reintentar. `U-01: …`: no se aplicó nada, pasarme el mensaje. Ante cualquier error, correr `rollback;` antes de seguir |
| 5 | Consultas 1A a 1E otra vez | Columna **Después** | Pasarme las salidas |
| 6 | P-01, P-02 y P-03 otra vez | `HTTP 401` (o `403`) con `"code":"42501"` en las tres. **Un `200`, aunque sea con `[]`, es falla** | Pasarme la salida |
| 7 | S-03 y S-04 con las filas 3 y 4 de la 1F | `HTTP 200` en las dos | Correr `3-rollback.sql` y pasarme la salida |
| 8 | Logs de Render durante 15 minutos | Ningún `permission denied` ni `42501` | `3-rollback.sql` |

> **Por qué productos distintos antes y después:** el lookup guarda en Redis. Si se repite el mismo producto, el `200` de después puede salir de Redis sin pasar por Supabase y no prueba nada.
> **Ojo con el `404`:** hoy una falla de Supabase en el lookup responde `404`, no `500` (se caracteriza en T-06 y se corrige en H-01). Un `404` en S-03 o S-04 es **falla**, no "producto inexistente".

### Resultado esperado de la verificación

| Consulta | Antes (paso 1) | Después (paso 5) |
|---|---|---|
| 1A · permisos | `rls = true` en todas las filas; `anon` y `authenticated` con los 8 privilegios en las dos tablas (en Postgres 17 incluye `MAINTAIN`); `service_role` con al menos `DELETE,INSERT,SELECT,UPDATE`; ninguna fila `PUBLIC` | Sin filas de `anon`, `authenticated` ni `PUBLIC`; `service_role` igual que antes; `rls = true` |
| 1B · policies | 1 fila: `Anyone can read products`, `SELECT`, `{anon,authenticated}`, `true` | 0 filas |
| 1C · funciones | **1 sola** fila: `search_products_by_name(text,integer)`, `security_definer = false`, el resto `true` | `public_exec`, `anon` y `authenticated` en `false`; `service_role` en `true` |
| 1D · vistas | 0 filas | 0 filas |
| 1E · default privileges | Informativo (se usa en C-05) | Igual que antes |
| 1F · muestra | 4 productos | No hace falta |

**Motivos para parar en el paso 1:** más de una fila en la 1C (otra firma de la RPC u otra función que lee el catálogo), alguna fila en la 1D, `service_role` sin alguno de sus 4 privilegios en la 1A, o privilegios distintos de los 8 de la tabla de resultados de abajo (el rollback los reproduce tal cual).

## Pruebas HTTP (desde una terminal)

Variables (las claves no van al chat ni al repo):

```bash
export SB_URL="https://<ref>.supabase.co"
export ANON="<anon / publishable key, la misma que usa native>"
export API="https://<url del server en Render>"
```

| ID | Qué prueba | Comando |
|---|---|---|
| P-01 | Leer `products` con la anon key | `curl -sS -w '\nHTTP %{http_code}\n' "$SB_URL/rest/v1/products?select=id,product_name&limit=1" -H "apikey: $ANON"` |
| P-02 | Leer `products_staging` con la anon key | `curl -sS -w '\nHTTP %{http_code}\n' "$SB_URL/rest/v1/products_staging?select=barcode&limit=1" -H "apikey: $ANON"` |
| P-03 | Llamar la RPC con la anon key | `curl -sS -w '\nHTTP %{http_code}\n' -X POST "$SB_URL/rest/v1/rpc/search_products_by_name" -H "apikey: $ANON" -H "Content-Type: application/json" -d '{"search_query":"leche","match_limit":1}'` |
| S-01 / S-03 | Lookup por barcode en el server | `curl -sS -o /dev/null -w 'HTTP %{http_code} · %{time_total}s\n' -X POST "$API/products/lookup" -H "Content-Type: application/json" -d '{"query":"<barcode>"}'` |
| S-02 / S-04 | Lookup por nombre (usa la RPC) | Igual que S-01 con `{"query":"<nombre>"}` |

Opcional, si hay un usuario de prueba con sesión: `GET $API/users/me/saved` y `GET $API/users/me/history` con `Authorization: Bearer <access token>` → `200` (leen `products` por embed con la secret key).

## Resultados (completar)

| Paso | Resultado | OK |
|---|---|---|
| 0 · V-03 y ETL parado | | |
| 1 · verificación antes | 2026-09-29. **1A:** 8 filas, `rls = true`; `anon`, `authenticated`, `postgres` y `service_role` con `DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` en las dos tablas; sin `PUBLIC`. `MAINTAIN` no estaba previsto: se agregó al rollback y al chequeo del cambio. **1B:** la policy pública, como se esperaba. **1C:** 1 fila, `security_definer = false`, todo `true` (incluido `public_exec`: la línea PUBLIC del rollback va). **1D:** a confirmar (0 filas). **1E:** defaults de `postgres` y `supabase_admin` que dan todo a `anon`/`authenticated` en tablas (`arwdDxtm`), funciones y secuencias → insumo de C-05 (D-60). **1F:** `7791708000081` · Langostino Pelado Crudo · `7790080032055` · Huevos Color Yemalinda Maple Map 20 Un. | ✅ salvo 1D |
| 2 · P-01 / P-02 / P-03 antes | | |
| 3 · S-01 / S-02 antes | | |
| 4 · cambio | | |
| 5 · verificación después | | |
| 6 · P-01 / P-02 / P-03 después | | |
| 7 · S-03 / S-04 después | | |
| 8 · logs de Render | | |
