alter table public.users
  add column if not exists onboarding_state jsonb not null default '{}'::jsonb;

alter table public.users
  add column if not exists onboarding_completed_at timestamp with time zone;

create index if not exists users_onboarding_completed_at_idx
  on public.users (onboarding_completed_at)
  where onboarding_completed_at is not null;
