-- Add team settings for routing preferences
create table if not exists public.workspace_settings (
  workspace_id uuid not null primary key references public.workspaces(id) on delete cascade,
  routing_mode text not null default 'balanced',
  created_at timestamptz not null default (now() at time zone 'utc'),
  updated_at timestamptz not null default (now() at time zone 'utc')
);
