# C-05 · Baseline de migraciones

Ítem C-05 de [`05-plan.md`](../../05-plan.md) · [ADR-0009](../../adr/0009-migraciones.md). Objetivo: que `supabase/migrations/` reproduzca la base **tal como está hoy** y que la CLI de Supabase sepa qué está aplicado.

Ya hecho en el repo: las `001`–`014` y la `015` están en `supabase/migrations/legacy/` (historia, no se ejecutan).

Lo que falta necesita la CLI, Docker y la contraseña de la base, así que lo corre el responsable (D-58). **Ninguno de los pasos 1 a 5 escribe en producción**; el paso 7 sí (solo la tabla de historial de la CLI) y se corre después de mi revisión.

## Antes de empezar

1. Docker Desktop abierto (la CLI lo usa para el dump).
2. La contraseña de la base a mano: Supabase → Project Settings → Database. No la pegues en el chat.
3. Trabajar en el checkout principal (`~/fitogenix-server`, rama `fitogenix/refactor-cleanup`, con `git pull`).

## Pasos

| Paso | Comando | Qué hace |
|---|---|---|
| 1 | `brew install supabase/tap/supabase` | Instala la CLI |
| 2 | `supabase init` | Crea `supabase/config.toml`. Si pregunta por VS Code / Deno, responder que no |
| 3 | `supabase login` | Abre el navegador para autorizar la CLI |
| 4 | `supabase link --project-ref unwefoczhgobfnbjikra` | Vincula el proyecto; pide la contraseña de la base |
| 5 | `supabase db dump --linked -f supabase/migrations/20260929000000_baseline.sql` | Genera la baseline (solo schema, sin datos) |
| 6 | `supabase migration list --linked` | Muestra el historial remoto. Pasame la salida |

Con eso me avisás. Yo reviso la baseline contra [`raw/supabase-schema.json`](../../raw/supabase-schema.json), incluidos el trigger `on_auth_user_created` (vive en `auth.users` y el dump de `public` puede no traerlo), las policies, los grants posteriores a U-01 y el COMMENT de la `015`. La pruebo sobre una base local vacía y la commiteo.

## Resultado de la revisión (2026-09-30)

El historial remoto trajo una migración que no esperábamos, `20260930115256_create_waitlist` (tabla `waitlist` del sitio www.fitogenix.com). Por eso la baseline quedó sin la `waitlist`, y esa migración va en su propio archivo con el SQL original (`supabase_migrations.schema_migrations.statements`). A la baseline se le sumaron el trigger `on_auth_user_created` (vive en `auth.users` y el dump no lo trae) y los `REVOKE` de U-01 sobre el catálogo: `pg_dump` no escribe los `REVOKE`, y en una base nueva los permisos por defecto de `public` lo dejaban abierto a `anon`.

Probado en una base local vacía (`supabase start` con Postgres y Auth): las dos migraciones se aplican sin errores y el dump de esa base es idéntico al de producción.

## Paso 7 (lo corre el responsable, desde `~/fitogenix-server` con `git pull`)

Marca la baseline como aplicada sin ejecutarla, y saca del historial la migración suelta `validation_tables_v1`, que no tiene archivo (sus tablas quedan dentro de la baseline). La de la `waitlist` ya figura como aplicada y ahora también tiene su archivo: no se toca.

```bash
supabase migration repair --status reverted 20260923014352
supabase migration repair --status applied 20260929000000
supabase migration list --linked
```

Al final, `migration list` tiene que mostrar `20260929000000` y `20260930115256`, cada una local y remota. Desde ahí, toda migración nueva va en `supabase/migrations/` con el checklist del ADR-0009 y se aplica con `supabase db push`, nunca pegando SQL en el editor.
