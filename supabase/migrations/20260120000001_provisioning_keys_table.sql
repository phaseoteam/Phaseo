-- =========================
-- provisioning_keys table
-- =========================

create table if not exists public.provisioning_keys (
  id uuid not null default gen_random_uuid(),
  team_id uuid not null,
  name text not null,
  hash text not null unique,
  prefix text not null,
  status text not null default 'active'::text,
  scopes text not null,
  created_by uuid not null,
  created_at timestamp with time zone not null default (now() at time zone 'utc'::text),
  last_used_at timestamp with time zone,
  kid text,
  soft_blocked boolean not null default false,
  constraint provisioning_keys_pkey primary key (id),
  constraint provisioning_keys_created_by_fkey foreign key (created_by) references public.users(user_id),
  constraint provisioning_keys_team_id_fkey foreign key (team_id) references public.teams(id)
);
create index if not exists provisioning_keys_team_id_idx
  on public.provisioning_keys (team_id);
create index if not exists provisioning_keys_hash_idx
  on public.provisioning_keys (hash);
create index if not exists provisioning_keys_prefix_idx
  on public.provisioning_keys (prefix);
