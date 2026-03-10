-- Ensure managed-chat requests always get an app_id at write time.
-- This is a safety net if gateway-side attribution code fails.

begin;

create unique index if not exists api_apps_team_id_app_key_key
  on public.api_apps (team_id, app_key);

create or replace function public.gateway_requests_attach_chat_app_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key_name text;
  v_chat_app_key constant text := 'https://ai-stats.phaseo.app/chat';
  v_app_id uuid;
begin
  if new.app_id is not null then
    return new;
  end if;

  if new.team_id is null or new.key_id is null then
    return new;
  end if;

  select k.name into v_key_name
  from public.keys k
  where k.id = new.key_id
  limit 1;

  if coalesce(v_key_name, '') <> '__chat_route_managed_key__' then
    return new;
  end if;

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
  values (
    new.team_id,
    v_chat_app_key,
    'AI Stats Chat',
    v_chat_app_key,
    true,
    coalesce(new.created_at, now()),
    now(),
    jsonb_build_object(
      'identityUrl', v_chat_app_key,
      'managed', true
    )
  )
  on conflict (team_id, app_key) do update
    set title = excluded.title,
        url = excluded.url,
        is_active = true,
        last_seen = greatest(public.api_apps.last_seen, excluded.last_seen),
        updated_at = now(),
        meta = coalesce(public.api_apps.meta, '{}'::jsonb) || excluded.meta
  returning id into v_app_id;

  new.app_id := v_app_id;
  return new;
end;
$$;

drop trigger if exists trg_gateway_requests_attach_chat_app_id on public.gateway_requests;

create trigger trg_gateway_requests_attach_chat_app_id
before insert or update of team_id, key_id, app_id
on public.gateway_requests
for each row
execute function public.gateway_requests_attach_chat_app_id();

-- Safety backfill for any current null app_id chat rows.
update public.gateway_requests gr
set app_id = aa.id
from public.keys k,
     public.api_apps aa
where gr.key_id = k.id
  and k.name = '__chat_route_managed_key__'
  and aa.team_id = gr.team_id
  and aa.app_key = 'https://ai-stats.phaseo.app/chat'
  and (gr.app_id is null or gr.app_id <> aa.id);

commit;
