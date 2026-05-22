alter table public.workspace_settings
add column if not exists gateway_plugins jsonb not null default '[]'::jsonb;
