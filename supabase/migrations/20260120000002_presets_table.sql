-- =========================
-- presets table
-- =========================

create table if not exists public.presets (
  id uuid not null default gen_random_uuid(),
  team_id uuid not null,
  name text not null,
  description text,
  config jsonb not null default '{}'::jsonb,
  created_by uuid not null,
  created_at timestamp with time zone not null default (now() at time zone 'utc'::text),
  updated_at timestamp with time zone not null default (now() at time zone 'utc'::text),
  constraint presets_pkey primary key (id),
  constraint presets_team_id_fkey foreign key (team_id) references public.teams(id),
  constraint presets_created_by_fkey foreign key (created_by) references public.users(user_id)
);
create index if not exists presets_team_id_idx
  on public.presets (team_id);
create index if not exists presets_name_team_id_idx
  on public.presets (name, team_id);
create index if not exists presets_config_gin_idx
  on public.presets using gin (config);
