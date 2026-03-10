-- Ensure chat requests consistently attach to the canonical AI Stats Chat app.
-- Note: api_apps is team-scoped, so this creates/uses one canonical chat app per team.

begin;

-- 1) Ensure app_key uniqueness can be relied on by runtime lookups.
with ranked as (
  select
    id,
    team_id,
    app_key,
    row_number() over (
      partition by team_id, app_key
      order by
        coalesce(last_seen, created_at) desc,
        created_at asc,
        id asc
    ) as rn,
    first_value(id) over (
      partition by team_id, app_key
      order by
        coalesce(last_seen, created_at) desc,
        created_at asc,
        id asc
    ) as keep_id
  from public.api_apps
),
dupes as (
  select id as drop_id, keep_id
  from ranked
  where rn > 1
)
update public.gateway_requests gr
set app_id = d.keep_id
from dupes d
where gr.app_id = d.drop_id;

with ranked as (
  select
    id,
    team_id,
    app_key,
    row_number() over (
      partition by team_id, app_key
      order by
        coalesce(last_seen, created_at) desc,
        created_at asc,
        id asc
    ) as rn
  from public.api_apps
)
delete from public.api_apps a
using ranked r
where a.id = r.id
  and r.rn > 1;

create unique index if not exists api_apps_team_id_app_key_key
  on public.api_apps (team_id, app_key);

-- 2) Create/refresh canonical chat app rows for teams using managed chat key.
with teams_using_chat as (
  select distinct gr.team_id
  from public.gateway_requests gr
  join public.keys k on k.id = gr.key_id
  where k.name = '__chat_route_managed_key__'
),
upserted as (
  insert into public.api_apps (
    team_id,
    app_key,
    title,
    url,
    is_active,
    last_seen,
    updated_at,
    meta
  )
  select
    t.team_id,
    'https://ai-stats.phaseo.app/chat',
    'AI Stats Chat',
    'https://ai-stats.phaseo.app/chat',
    true,
    now(),
    now(),
    jsonb_build_object(
      'identityUrl', 'https://ai-stats.phaseo.app/chat',
      'managed', true
    )
  from teams_using_chat t
  on conflict (team_id, app_key) do update
    set title = excluded.title,
        url = excluded.url,
        is_active = true,
        last_seen = greatest(public.api_apps.last_seen, excluded.last_seen),
        updated_at = now(),
        meta = coalesce(public.api_apps.meta, '{}'::jsonb) || excluded.meta
  returning id, team_id
)
select 1;

-- 3) Backfill chat requests (managed key) to canonical app_id.
update public.gateway_requests gr
set app_id = aa.id
from public.keys k,
     public.api_apps aa
where gr.key_id = k.id
  and aa.team_id = gr.team_id
  and aa.app_key = 'https://ai-stats.phaseo.app/chat'
  and k.name = '__chat_route_managed_key__'
  and (gr.app_id is null or gr.app_id <> aa.id);

commit;
