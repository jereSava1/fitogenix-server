-- 06-catalogo-confiable.md §5 y §6b, con la regla de verificación D-98.
--
-- 1) `product_facts`: un dato observado por fila, con su fuente y su evidencia. Nunca se pisa un dato:
--    la evidencia nueva agrega una fila. Lo único que cambia en una fila es su `status`.
--    Dueño: ETL (ADR-0005). Sin acceso para anon ni authenticated; RLS activo.
-- 2) `products.nutrition_basis`: sobre qué base está la nutrición guardada ('100g' o '100ml');
--    nula si la fuente no lo dice. Nunca se convierte ml a g.

create table public.product_facts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  field text not null check (field in (
    'ingredients', 'energy-kcal', 'proteins', 'carbohydrates', 'sugars', 'fat', 'saturated-fat',
    'trans-fat', 'fiber', 'sodium', 'salt', 'cholesterol', 'serving', 'net_content'
  )),
  value_text text,
  value_number numeric,
  unit text check (char_length(unit) <= 16),
  basis text check (basis in ('100g', '100ml', 'serving', 'package')),
  source text not null check (char_length(source) between 1 and 64),
  evidence_url text,
  evidence_sha256 text check (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  captured_at timestamptz not null,
  status text not null default 'sin_verificar' check (status in ('sin_verificar', 'verificado', 'en_conflicto')),
  status_changed_at timestamptz not null default now(),
  reading_id text check (char_length(reading_id) <= 128),
  created_at timestamptz not null default now(),
  constraint product_facts_has_value check (value_text is not null or value_number is not null)
);

-- Todos los datos de un producto, el más reciente primero.
create index product_facts_product_idx on public.product_facts (product_id, field, captured_at desc);
-- Todos los datos en un estado (por ejemplo, lo que falta verificar).
create index product_facts_status_idx on public.product_facts (status, product_id);

comment on table public.product_facts is 'Datos observados de cada producto, uno por fila, con fuente y evidencia (06-catalogo-confiable.md §5). Solo se agregan filas; lo único que cambia es status. La escribe el ETL con service_role.';
comment on column public.product_facts.reading_id is 'De qué transcripción o lectura salió el dato (por ejemplo, la segunda lectura de una foto de etiqueta).';
comment on column public.product_facts.evidence_sha256 is 'Hash de la foto de etiqueta, si la evidencia es una foto.';

create function public.product_facts_inmutable() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'status' - 'status_changed_at') is distinct from (to_jsonb(old) - 'status' - 'status_changed_at') then
    raise exception 'product_facts: solo se puede cambiar el estado; la evidencia nueva agrega una fila';
  end if;
  if new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end;
$$;

revoke execute on function public.product_facts_inmutable() from public, anon, authenticated;

create trigger product_facts_inmutable before update on public.product_facts
  for each row execute function public.product_facts_inmutable();

alter table public.product_facts enable row level security;
revoke all on table public.product_facts from anon, authenticated;
grant all on table public.product_facts to service_role;

alter table public.products
  add column nutrition_basis text check (nutrition_basis in ('100g', '100ml'));

comment on column public.products.nutrition_basis is 'Base de la nutrición guardada: 100g o 100ml. Nula si la fuente no lo dice. Nunca se convierte ml a g.';

-- Rollback:
-- alter table public.products drop column nutrition_basis;
-- drop table public.product_facts;
-- drop function public.product_facts_inmutable();
