# U-01 · Cerrar el catálogo a la anon key

Fix de **SEC-01** (D-08, RNF-S01, ADR-0005 / ADR-0010). Ítem U-01 de [`05-plan.md`](../../05-plan.md). Lo corre el responsable del proyecto en el SQL Editor de Supabase (D-58 y D-61).

| Archivo | Qué hace | Escribe |
|---|---|---|
| [`1-verificacion.sql`](1-verificacion.sql) | Cinco consultas cortas (1A a 1E), **una por vez**: permisos por tabla y rol, policies, funciones que tocan el catálogo, vistas + ACL + default privileges, y 4 productos al azar para el smoke | No |
| [`2-cambio.sql`](2-cambio.sql) | Borra la policy pública, `REVOKE` a `anon`/`authenticated`/`PUBLIC` sobre `products` y `products_staging`, `REVOKE EXECUTE` de la RPC y `GRANT EXECUTE` explícito a `service_role`. Una transacción con chequeos al final: si algo no queda bien, aborta sin aplicar nada. Se pega **entero** (22 líneas) | Sí |
| [`3-rollback.sql`](3-rollback.sql) | Vuelve exactamente al estado anterior (incluida la exposición) | Sí |

**Probado** el 2026-09-29 en un Postgres 16 local con los roles de Supabase simulados (`anon`, `authenticated`, `service_role` con `BYPASSRLS`, `authenticator` con `SET ROLE`, default privileges de `public` como los de Supabase): antes, `anon` lee 50/50 filas y la RPC; después, `permission denied` en las 3 pruebas para `anon` y `authenticated`, y `service_role` sigue leyendo todo; el cambio es idempotente; si `service_role` solo tenía `EXECUTE` vía `PUBLIC`, lo conserva; un chequeo fallido no deja nada aplicado; el rollback reproduce las ACL originales (misma verificación, sin diferencias). El 2026-09-29 se partió la verificación en consultas cortas porque la versión de una sola consulta era demasiado larga para pegarla; las versiones cortas se volvieron a probar enteras. Lo que **no** se pudo probar acá: PostgREST real (códigos HTTP) y el server en Render; para eso están P-01 a P-03 y S-01 a S-04.

## Procedimiento

| Paso | Qué | Resultado esperado | Si no da eso |
|---|---|---|---|
| 0 | Confirmar V-03: nadie usa un build viejo de la app (era Expo, `849bd54`…`ba53ac9`) que lea `products` directo. Parar el ETL | — | Esperar |
| 1 | Correr las consultas 1A a 1E de `1-verificacion.sql` (**V**), una por vez, **sin texto seleccionado** en el editor (si hay selección, Supabase corre solo eso) | Ver tabla "Verificación" | **Parar** y pasarme las 5 salidas |
| 2 | Pruebas HTTP P-01 a P-03 **antes** del cambio | P-01 y P-03: `200` con filas (confirma SEC-01). P-02: `200 []` (RLS sin policies) | Pasarme la salida |
| 3 | Smoke S-01 y S-02 **antes** del cambio (filas 1 y 2 de la 1E) | `200` en los dos | Parar: el server ya falla sin el cambio |
| 4 | Correr `2-cambio.sql` | `Success. No rows returned` | Si dice `lock timeout`, reintentar. Si dice `U-01: …`, no se aplicó nada: pasarme el mensaje. Ante cualquier error, correr `rollback;` antes de seguir |
| 5 | Correr 1A a 1D (**P**) | Ver tabla "Verificación" | Pasarme las salidas |
| 6 | Pruebas P-01 a P-03 **después** | `401` (o `403`) con `"code":"42501"` en las tres. **Un `200`, aunque sea `[]`, es falla** | Pasarme la salida |
| 7 | Smoke S-03 y S-04 **después** (filas 3 y 4 de la 1E, que no están en Redis) | `200` en todos | **Rollback** (`3-rollback.sql`) y pasarme la salida |
| 8 | Logs de Render, 15 minutos | Ningún `permission denied` ni `42501` | Rollback |

> Por qué filas distintas antes y después: el lookup cachea en Redis. Si se repite el mismo producto, el `200` de después podría salir de Redis sin tocar Supabase y no probaría nada. Y ojo: hoy **una falla de Supabase en el lookup responde `404`**, no `500` (caracterizado en T-06), así que un `404` en S-03/S-04 es falla, no "producto inexistente".

## Verificación: esperado antes (V) y después (P)

| Consulta | V (antes) | P (después) |
|---|---|---|
| 1A · permisos | 6 filas, `rls = true` en todas; `anon` y `authenticated`: los 7 privilegios; `service_role`: al menos `DELETE,INSERT,SELECT,UPDATE`; `grants_public = 0` | `anon` y `authenticated`: `privilegios` vacío; `service_role`: igual que antes; `rls = true`; `grants_public = 0` |
| 1B · policies | 1 fila: `Anyone can read products`, `SELECT`, `{anon,authenticated}`, `true` | 0 filas |
| 1C · funciones | **1 sola** fila: `search_products_by_name(text,integer)`, `security_definer = false`, todo lo demás `true` | `public_exec`, `anon`, `authenticated`: `false`; `service_role`: `true` |
| 1D · vistas, ACL, defaults | Ninguna fila `vista`; las `acl_tabla` se guardan para comparar; `default_privileges` es informativo (no se cambia en U-01, D-61) | Ninguna `vista`; `acl_tabla` sin `anon` ni `authenticated` |
| 1E · muestra | 4 productos | No hace falta repetirla |

Motivos para **parar en el paso 1**: más de una fila en la 1C (otra firma de la RPC u otra función que nombra el catálogo), alguna fila `vista` en la 1D, o `service_role` sin alguno de sus 4 privilegios en la 1A.

## Pruebas HTTP (desde una terminal)

Variables (no pegar las claves en el chat ni en el repo):

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
| S-02 / S-04 | Lookup por nombre en el server (usa la RPC) | Igual que S-01 con `{"query":"<nombre>"}` |

Opcional, si hay un usuario de prueba con sesión: `GET $API/users/me/saved` con su `Authorization: Bearer <access token>` → `200` (los guardados leen `products` por embed con la secret key).

## Resultados (completar)

| Paso | Resultado | OK |
|---|---|---|
| V-03 confirmado | | |
| 1 · V | | |
| 2 · P-01 / P-02 / P-03 antes | | |
| 3 · S-01 / S-02 antes | | |
| 4 · cambio | | |
| 5 · P | | |
| 6 · P-01 / P-02 / P-03 después | | |
| 7 · S-03 / S-04 después | | |
| 8 · logs de Render | | |
