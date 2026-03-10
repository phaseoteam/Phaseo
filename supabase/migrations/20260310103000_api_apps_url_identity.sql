-- Move API app attribution identity to deterministic URL-based keys.
-- This keeps one app row per (team_id, url) and removes random app fan-out.

begin;

alter table public.api_apps
  alter column url set default 'about:blank';

update public.api_apps
set url = 'about:blank',
    updated_at = now()
where url is null
   or btrim(url) = '';

update public.api_apps
set url = btrim(url),
    updated_at = now()
where url is distinct from btrim(url);

-- Deduplicate existing rows by URL identity within each team.
with ranked as (
  select
    id,
    team_id,
    url,
    row_number() over (
      partition by team_id, url
      order by
        coalesce(last_seen, created_at) desc,
        created_at asc,
        id asc
    ) as rn,
    first_value(id) over (
      partition by team_id, url
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
    url,
    row_number() over (
      partition by team_id, url
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

-- Keep app_key aligned with URL identity for readability and consistency.
update public.api_apps
set app_key = url,
    updated_at = now()
where app_key is distinct from url;

create unique index if not exists api_apps_team_id_url_key
  on public.api_apps (team_id, url);

commit;
