-- F-07: feedback de la app y reportes de problemas con un producto. Los escribe solo el
-- server (service_role) y los puede mandar cualquiera, con o sin cuenta. RLS activo y sin
-- policies ni grants para anon/authenticated: desde la API de Supabase no se leen ni se
-- escriben. Con la cuenta se borra lo que la persona escribió (texto libre).

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  message text not null check (char_length(message) between 1 and 2000),
  app_version text check (char_length(app_version) <= 32),
  platform text check (platform in ('ios', 'android')),
  created_at timestamptz not null default now()
);

create index feedback_user_idx on public.feedback (user_id) where user_id is not null;

comment on table public.feedback is 'Comentarios sobre la app (POST /v1/feedback). user_id nulo = anónimo. No guarda la IP.';

create table public.product_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  type text not null check (type in ('info', 'ingredients', 'score', 'image', 'other')),
  message text check (char_length(message) between 1 and 2000),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);

create index product_reports_product_idx on public.product_reports (product_id, created_at desc);
create index product_reports_user_idx on public.product_reports (user_id) where user_id is not null;

comment on table public.product_reports is 'Problemas con los datos de un producto (POST /v1/products/:productId/reports). user_id nulo = anónimo. status lo cambia quien los revisa. No guarda la IP.';

alter table public.feedback enable row level security;
alter table public.product_reports enable row level security;

revoke all on table public.feedback, public.product_reports from anon, authenticated;
grant all on table public.feedback, public.product_reports to service_role;

-- Rollback:
-- drop table public.product_reports;
-- drop table public.feedback;
