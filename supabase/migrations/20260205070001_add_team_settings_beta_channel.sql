-- Add beta channel toggle to team_settings
alter table public.team_settings
  add column if not exists beta_channel_enabled boolean not null default false;
