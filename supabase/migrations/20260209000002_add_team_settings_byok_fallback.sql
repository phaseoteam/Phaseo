-- Ensure BYOK fallback toggle exists on team settings
alter table public.team_settings
  add column if not exists byok_fallback_enabled boolean not null default true;
