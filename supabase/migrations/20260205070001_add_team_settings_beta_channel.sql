-- Add beta channel toggle to workspace_settings
alter table public.workspace_settings
  add column if not exists beta_channel_enabled boolean not null default false;
