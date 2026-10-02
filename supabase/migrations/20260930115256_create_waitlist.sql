create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  source text,
  created_at timestamptz not null default now(),
  constraint waitlist_email_format check (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint waitlist_source_length check (source is null or char_length(source) <= 40)
);

comment on table public.waitlist is 'Lista de espera del sitio www.fitogenix.com. El sitio solo puede insertar (rol anon); nadie puede leerla por la API pública.';

create unique index waitlist_email_lower_key on public.waitlist (lower(email));

alter table public.waitlist enable row level security;

create policy "Website visitors can join the waitlist"
  on public.waitlist for insert
  to anon, authenticated
  with check (true);

revoke select, update, delete on public.waitlist from anon, authenticated;
