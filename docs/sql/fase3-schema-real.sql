-- ════════════════════════════════════════════════════════════════════════
-- Fitogenix · Fase 3 · Foto del schema REAL de Supabase (solo lectura)
--
-- Cómo correrlo: Supabase → SQL Editor → pegar CONSULTA 1 → Run.
-- Devuelve UNA celda con un JSON. Copiala entera y guardala en
-- `docs/raw/supabase-schema.json` (o pegámela en el chat).
-- Ninguna de estas consultas escribe ni modifica nada.
-- ════════════════════════════════════════════════════════════════════════

-- ─── CONSULTA 1 — schema public completo ────────────────────────────────
select jsonb_pretty(jsonb_build_object(
  'generado_en', now(),
  'postgres', version(),
  'estadisticas_desde', (select stats_reset from pg_stat_database where datname = current_database()),

  'extensiones', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'nombre', e.extname, 'version', e.extversion, 'schema', n.nspname
    ) order by e.extname), '[]'::jsonb)
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  ),

  'tablas', (
    select coalesce(jsonb_agg(x.t order by x.t->>'tabla'), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'tabla', c.relname,
        'tipo', c.relkind,                       -- r=tabla, v=vista, m=vista materializada, p=particionada
        'rls', c.relrowsecurity,
        'rls_forzado', c.relforcerowsecurity,
        'filas_estimadas', c.reltuples::bigint,
        'tamano', pg_size_pretty(pg_total_relation_size(c.oid)),
        'comentario', obj_description(c.oid, 'pg_class'),
        'columnas', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'col', a.attname,
            'tipo', format_type(a.atttypid, a.atttypmod),
            'not_null', a.attnotnull,
            'default', pg_get_expr(d.adbin, d.adrelid),
            'comentario', col_description(c.oid, a.attnum)
          ) order by a.attnum), '[]'::jsonb)
          from pg_attribute a
          left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
          where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
        ),
        'constraints', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'nombre', co.conname, 'tipo', co.contype, 'def', pg_get_constraintdef(co.oid)
          ) order by co.conname), '[]'::jsonb)
          from pg_constraint co where co.conrelid = c.oid
        ),
        'indices', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'nombre', i.indexrelname,
            'def', pg_get_indexdef(i.indexrelid),
            'scans', i.idx_scan,
            'tamano', pg_size_pretty(pg_relation_size(i.indexrelid))
          ) order by i.indexrelname), '[]'::jsonb)
          from pg_stat_user_indexes i where i.relid = c.oid
        ),
        'triggers', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'nombre', tg.tgname, 'def', pg_get_triggerdef(tg.oid)
          ) order by tg.tgname), '[]'::jsonb)
          from pg_trigger tg where tg.tgrelid = c.oid and not tg.tgisinternal
        ),
        'uso', (
          select jsonb_build_object(
            'seq_scan', s.seq_scan, 'idx_scan', s.idx_scan,
            'inserts', s.n_tup_ins, 'updates', s.n_tup_upd, 'deletes', s.n_tup_del,
            'filas_vivas', s.n_live_tup
          )
          from pg_stat_user_tables s where s.relid = c.oid
        ),
        'grants_anon_authenticated', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'rol', g.grantee, 'priv', g.privilege_type
          ) order by g.grantee, g.privilege_type), '[]'::jsonb)
          from information_schema.role_table_grants g
          where g.table_schema = n.nspname and g.table_name = c.relname
            and g.grantee in ('anon', 'authenticated')
        )
      ) as t
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
    ) x
  ),

  'policies', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'tabla', p.tablename, 'nombre', p.policyname, 'comando', p.cmd,
      'roles', p.roles, 'using', p.qual, 'with_check', p.with_check
    ) order by p.tablename, p.policyname), '[]'::jsonb)
    from pg_policies p where p.schemaname = 'public'
  ),

  'funciones', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'nombre', p.proname,
      'args', pg_get_function_identity_arguments(p.oid),
      'security_definer', p.prosecdef,
      'anon_puede_ejecutar', has_function_privilege('anon', p.oid, 'EXECUTE'),
      'authenticated_puede_ejecutar', has_function_privilege('authenticated', p.oid, 'EXECUTE'),
      'def', pg_get_functiondef(p.oid)
    ) order by p.proname), '[]'::jsonb)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      -- excluye las funciones que trae una extensión (p. ej. pg_trgm)
      and not exists (
        select 1 from pg_depend dep
        where dep.classid = 'pg_proc'::regclass and dep.objid = p.oid and dep.deptype = 'e'
      )
  ),

  'storage_buckets', (
    select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'publico', b.public) order by b.id), '[]'::jsonb)
    from storage.buckets b
  ),

  'auth_usuarios_total', (select count(*) from auth.users)
)) as schema_fitogenix;


-- ─── CONSULTA 2 — ¿las migraciones se registraron con el CLI? ────────────
-- Si da "relation ... does not exist", es normal: significa que las
-- migraciones se aplicaron a mano en el SQL Editor. Avisame cuál de los dos
-- casos fue.
select version, name
from supabase_migrations.schema_migrations
order by version;


-- ─── CONSULTA 3 — triggers sobre auth.users (la 1 solo miraba public) ─────
-- Confirma qué dispara handle_new_user() al registrarse un usuario.
select tgname as trigger, pg_get_triggerdef(t.oid) as definicion, tgenabled as habilitado
from pg_trigger t
where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal;


-- ─── CONSULTA 4 — con qué versión del motor se calcularon las columnas ────
-- denormalizadas de products (score, score_label, sello). El server en main
-- corre 'ftg-rubric-v2.3'.
select coalesce(engine_version, '(null)') as engine_version,
       count(*)                          as filas,
       count(*) filter (where score is null) as sin_score,
       count(*) filter (where sello is not null) as con_sello,
       max(updated_at)                   as ultima_actualizacion
from products
group by 1
order by 2 desc;


-- ─── CONSULTA 5 — filas de la cascada retirada (name_key / solo IA) ───────
-- Decide qué hacer con products.name_key y con las filas sin barcode
-- (docs/03-contratos.md, A.4).
select
  count(*)                                                      as total,
  count(*) filter (where barcode is null)                       as sin_barcode,
  count(*) filter (where name_key is not null)                  as con_name_key,
  count(*) filter (where barcode is null and name_key is not null) as solo_por_nombre,
  count(*) filter (where data_source = 'ai')                    as origen_ia,
  count(*) filter (where ai_enriched)                           as enriquecidas_con_ia,
  count(*) filter (where nova_group is not null)                as con_nova_group,
  count(*) filter (where manufacturer_info is not null)         as con_manufacturer_info
from products;


-- ─── CONSULTA 6 — ¿cuántos productos tienen contenido neto disponible? ────
-- Mide la cobertura de `quantity` (contenido neto, texto libre de OFF) y de
-- `serving_size` (porción) en el staging, por fuente, para los productos que
-- llegaron al catálogo. Hoy se pierden en el merge porque `products` no tiene
-- esas columnas (docs/03-contratos.md, A.4).
select
  s.source,
  count(distinct s.merged_into)                                                    as productos_en_catalogo,
  count(distinct s.merged_into) filter (where nullif(trim(s.raw_payload->>'quantity'), '') is not null)     as con_contenido_neto,
  count(distinct s.merged_into) filter (where nullif(trim(s.raw_payload->>'serving_size'), '') is not null) as con_porcion
from products_staging s
where s.merged_into is not null
group by s.source
order by productos_en_catalogo desc;


-- ─── CONSULTA 7 — ¿el contenido neto se puede sacar del nombre? ───────────
-- VTEX (vea, disco, jumbo, carrefour) no trae contenido neto (consulta 6),
-- pero sus nombres suelen incluirlo ("Leche Entera 1 L", "Galletitas x 118 g").
-- Mide cuántos productos tienen un patrón de cantidad reconocible en el nombre.
select
  count(*)                                                                         as total,
  count(*) filter (where product_name ~* '(^|[^0-9])[0-9]+([.,][0-9]+)?\s*(g|gr|grs|gramos|kg|kgs|ml|cc|cm3|l|lt|lts|litro|litros)(\s|$|[^a-z])') as con_cantidad_en_nombre,
  count(*) filter (where product_name ~* '[0-9]+\s*x\s*[0-9]+')                   as parece_multipack
from products;


-- ─── CONSULTA 8 — ¿hay imágenes con http:// (iOS las bloquea)? ─────────────
-- Con D-49 la app carga `image_url` directo. iOS (App Transport Security)
-- bloquea por default las URLs sin HTTPS.
select
  split_part(split_part(image_url, '://', 2), '/', 1) as host,
  count(*)                                              as imagenes,
  count(*) filter (where image_url like 'http://%')     as sin_https
from products
where image_url is not null
group by 1
order by 2 desc
limit 20;
