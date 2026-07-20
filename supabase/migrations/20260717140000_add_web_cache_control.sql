create table if not exists public.web_cache_generations (
  scope text primary key,
  generation bigint not null default 1 check (generation > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  check (scope ~ '^[a-z0-9-]{1,64}$')
);

create table if not exists public.web_cache_purge_events (
  id bigint generated always as identity primary key,
  scope text not null check (scope ~ '^[a-z0-9-]{1,64}$'),
  target_id text,
  tags text[] not null,
  browser_generation_bumped boolean not null default false,
  generation bigint,
  actor_user_id uuid references auth.users(id) on delete set null,
  purge_succeeded boolean not null,
  purge_error jsonb,
  created_at timestamptz not null default now(),
  check (target_id is null or length(target_id) <= 200),
  check (cardinality(tags) between 1 and 100)
);

create index if not exists web_cache_purge_events_created_at_idx
  on public.web_cache_purge_events (created_at desc);

alter table public.web_cache_generations enable row level security;
alter table public.web_cache_purge_events enable row level security;

revoke all on table public.web_cache_generations from public, anon, authenticated;
revoke all on table public.web_cache_purge_events from public, anon, authenticated;
grant select, insert, update on table public.web_cache_generations to service_role;
grant select, insert on table public.web_cache_purge_events to service_role;
grant usage, select on sequence public.web_cache_purge_events_id_seq to service_role;

insert into public.web_cache_generations (scope, generation)
values ('search', 1)
on conflict (scope) do nothing;

create or replace function public.bump_web_cache_generation(
  p_scope text,
  p_actor_user_id uuid default null
)
returns bigint
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.web_cache_generations (scope, generation, updated_at, updated_by)
  values (p_scope, 2, now(), p_actor_user_id)
  on conflict (scope) do update
    set generation = public.web_cache_generations.generation + 1,
        updated_at = now(),
        updated_by = excluded.updated_by
  returning generation;
$$;

comment on function public.bump_web_cache_generation(text, uuid) is
  'Atomically advances a browser-visible cache generation after an administrative cache purge.';

revoke all on function public.bump_web_cache_generation(text, uuid) from public, anon, authenticated;
grant execute on function public.bump_web_cache_generation(text, uuid) to service_role;

notify pgrst, 'reload schema';
