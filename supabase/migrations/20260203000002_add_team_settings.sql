-- Add team settings for routing preferences
create table if not exists public.team_settings (
  team_id uuid not null primary key references public.teams(id) on delete cascade,
  routing_mode text not null default 'balanced',
  created_at timestamptz not null default (now() at time zone 'utc'),
  updated_at timestamptz not null default (now() at time zone 'utc')
);
