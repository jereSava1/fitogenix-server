-- F-06: respuestas del onboarding de cada usuario (RF-048). Síntomas, dietas y alergias son
-- datos sensibles: solo se guardan con consentimiento registrado (RNF-S10) y se borran con la
-- cuenta. La escribe solo el server (service_role); RLS activo, sin policies ni grants para
-- anon/authenticated.

create table public.onboarding_responses (
  user_id uuid primary key references auth.users (id) on delete cascade,
  answers jsonb not null check (jsonb_typeof(answers) = 'object'),
  consent_health_data_at timestamptz,
  consent_text_version text check (char_length(consent_text_version) between 1 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint onboarding_consent_completo
    check ((consent_health_data_at is null) = (consent_text_version is null)),
  constraint onboarding_salud_con_consentimiento
    check (
      consent_health_data_at is not null
      or (coalesce(jsonb_array_length(answers -> 'symptoms'), 0) = 0
          and coalesce(jsonb_array_length(answers -> 'diets'), 0) = 0
          and coalesce(jsonb_array_length(answers -> 'allergies'), 0) = 0)
    )
);

comment on table public.onboarding_responses is 'Respuestas del onboarding (POST /v1/users/me/onboarding), una fila por usuario. symptoms, diets y allergies son datos sensibles: sin consent_health_data_at no se guardan.';

alter table public.onboarding_responses enable row level security;

revoke all on table public.onboarding_responses from anon, authenticated;
grant all on table public.onboarding_responses to service_role;

-- Rollback:
-- drop table public.onboarding_responses;
