-- Fix gateway landing RPC regressions and add structured request detail storage.
-- 1) Restore app_id in get_public_top_apps and remove stale visibility thresholds.
-- 2) Remove stale provider market-share thresholds so low-volume traffic still appears.
-- 3) Add a separate gateway_request_details table for full request/response payload storage.
-- 4) Add app referential integrity now that gateway_requests was reset.

alter table public.gateway_requests
  drop constraint if exists gateway_requests_app_id_fkey;
alter table public.gateway_requests
  add constraint gateway_requests_app_id_fkey
  foreign key (app_id) references public.api_apps (id) on delete set null;
create or replace function public.gateway_usage_total_tokens(p_usage jsonb)
returns bigint
language sql
immutable
as $$
  select coalesce(
    case
      when coalesce(p_usage->>'total_tokens', '') ~ '^\d+$'
        then (p_usage->>'total_tokens')::bigint
      else null
    end,
    greatest(
      coalesce(case when coalesce(p_usage->>'input_text_tokens', '') ~ '^\d+$' then (p_usage->>'input_text_tokens')::bigint end, 0),
      coalesce(case when coalesce(p_usage->>'input_tokens', '') ~ '^\d+$' then (p_usage->>'input_tokens')::bigint end, 0),
      coalesce(case when coalesce(p_usage->>'prompt_tokens', '') ~ '^\d+$' then (p_usage->>'prompt_tokens')::bigint end, 0)
    )
    + greatest(
      coalesce(case when coalesce(p_usage->>'output_text_tokens', '') ~ '^\d+$' then (p_usage->>'output_text_tokens')::bigint end, 0),
      coalesce(case when coalesce(p_usage->>'output_tokens', '') ~ '^\d+$' then (p_usage->>'output_tokens')::bigint end, 0),
      coalesce(case when coalesce(p_usage->>'completion_tokens', '') ~ '^\d+$' then (p_usage->>'completion_tokens')::bigint end, 0)
    )
    + coalesce(case when coalesce(p_usage->>'reasoning_tokens', '') ~ '^\d+$' then (p_usage->>'reasoning_tokens')::bigint end, 0)
    + coalesce(case when coalesce(p_usage->>'cached_read_text_tokens', '') ~ '^\d+$' then (p_usage->>'cached_read_text_tokens')::bigint end, 0),
    0
  );
$$;
create or replace function public.get_public_market_share(
  p_dimension text default 'organization',
  p_time_range text default 'week'
)
returns table (
  name text,
  requests bigint,
  tokens bigint,
  share_pct numeric
) as $$
declare
  v_since timestamptz;
  v_now timestamptz := now();
begin
  case p_time_range
    when 'today' then v_since := date_trunc('day', v_now);
    when 'week' then v_since := v_now - interval '7 days';
    when 'month' then v_since := date_trunc('month', v_now);
    else v_since := v_now - interval '7 days';
  end case;

  if p_dimension = 'organization' then
    return query
    with resolved as (
      select
        gr.created_at,
        gr.usage,
        coalesce(dm_direct.model_id, apm.internal_model_id) as internal_model_id
      from public.gateway_requests gr
      left join public.data_models dm_direct on dm_direct.model_id = gr.model_id
      left join lateral (
        select apm.internal_model_id
        from public.data_api_provider_models apm
        where apm.api_model_id = gr.model_id
          and apm.provider_id = gr.provider
        order by apm.is_active_gateway desc, apm.updated_at desc nulls last
        limit 1
      ) apm on true
      where gr.created_at >= v_since
        and gr.success is true
    ),
    totals as (
      select
        count(*)::numeric as total_requests,
        sum(public.gateway_usage_total_tokens(r.usage))::numeric as total_tokens
      from resolved r
      where r.internal_model_id is not null
    ),
    org_stats as (
      select
        coalesce(org.name, dm.organisation_id) as org_name,
        count(*) as req_count,
        sum(public.gateway_usage_total_tokens(r.usage)) as tok_count
      from resolved r
      join public.data_models dm on dm.model_id = r.internal_model_id
      left join public.data_organisations org on dm.organisation_id = org.organisation_id
      where r.internal_model_id is not null
        and dm.organisation_id is not null
      group by org.name, dm.organisation_id
    )
    select
      os.org_name,
      os.req_count::bigint,
      os.tok_count::bigint,
      round((os.req_count / nullif(t.total_requests, 0) * 100)::numeric, 2) as share_pct
    from org_stats os, totals t
    order by os.req_count desc;
  else
    return query
    with totals as (
      select
        count(*)::numeric as total_requests,
        sum(public.gateway_usage_total_tokens(gr.usage))::numeric as total_tokens
      from public.gateway_requests gr
      where gr.created_at >= v_since
        and gr.success is true
        and gr.provider is not null
        and gr.provider <> ''
    ),
    provider_stats as (
      select
        gr.provider as prov_name,
        count(*) as req_count,
        sum(public.gateway_usage_total_tokens(gr.usage)) as tok_count
      from public.gateway_requests gr
      where gr.created_at >= v_since
        and gr.success is true
        and gr.provider is not null
        and gr.provider <> ''
      group by gr.provider
    )
    select
      ps.prov_name,
      ps.req_count::bigint,
      ps.tok_count::bigint,
      round((ps.req_count / nullif(t.total_requests, 0) * 100)::numeric, 2) as share_pct
    from provider_stats ps, totals t
    order by ps.req_count desc;
  end if;
end;
$$ language plpgsql stable;
drop function if exists public.get_public_top_apps(integer, text);
create or replace function public.get_public_top_apps(
  p_limit integer default 20,
  p_time_range text default 'week'
)
returns table (
  app_id text,
  app_name text,
  requests bigint,
  tokens bigint,
  unique_models integer
) as $$
declare
  v_since timestamptz;
  v_now timestamptz := now();
begin
  case p_time_range
    when 'today' then v_since := date_trunc('day', v_now);
    when 'week' then v_since := v_now - interval '7 days';
    when 'month' then v_since := date_trunc('month', v_now);
    else v_since := v_now - interval '7 days';
  end case;

  return query
  select
    gr.app_id::text as app_id,
    coalesce(aa.title, 'App-' || substring(md5(gr.app_id::text), 1, 8)) as app_name,
    count(*)::bigint as requests,
    sum(public.gateway_usage_total_tokens(gr.usage))::bigint as tokens,
    count(distinct nullif(gr.model_id, ''))::integer as unique_models
  from public.gateway_requests gr
  left join public.api_apps aa on gr.app_id = aa.id
  where gr.created_at >= v_since
    and gr.success is true
    and gr.app_id is not null
  group by gr.app_id, aa.title
  order by requests desc, tokens desc
  limit p_limit;
end;
$$ language plpgsql stable;
create table if not exists public.gateway_request_details (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  gateway_request_id uuid not null,
  gateway_request_created_at timestamp with time zone not null,
  request_id text not null,
  team_id uuid not null references public.teams (id) on delete cascade,
  app_id uuid null references public.api_apps (id) on delete set null,
  key_id uuid null references public.keys (id) on delete set null,
  endpoint text not null,
  model_id text not null,
  provider text null,
  status_code integer null,
  success boolean not null default true,
  request_payload jsonb not null default '{}'::jsonb,
  request_content jsonb null,
  gateway_response jsonb null,
  response_content jsonb null,
  provider_request jsonb null,
  provider_response jsonb null,
  metadata jsonb not null default '{}'::jsonb,
  constraint gateway_request_details_gateway_request_fkey
    foreign key (gateway_request_id, gateway_request_created_at)
    references public.gateway_requests (id, created_at)
    on delete cascade
);
create index if not exists idx_gateway_request_details_team_created
  on public.gateway_request_details (team_id, created_at desc);
create index if not exists idx_gateway_request_details_request_id
  on public.gateway_request_details (request_id);
create index if not exists idx_gateway_request_details_gateway_request
  on public.gateway_request_details (gateway_request_id, gateway_request_created_at);
alter table public.gateway_request_details enable row level security;
drop policy if exists gateway_request_details_select_own_team on public.gateway_request_details;
create policy gateway_request_details_select_own_team
  on public.gateway_request_details
  for select
  to authenticated
  using (public.is_team_member(team_id));
drop policy if exists gateway_request_details_insert_service on public.gateway_request_details;
create policy gateway_request_details_insert_service
  on public.gateway_request_details
  for insert
  to service_role
  with check (true);
grant select on public.gateway_request_details to authenticated;
grant insert on public.gateway_request_details to service_role;
comment on table public.gateway_request_details is
  'Structured full request and response payload storage for gateway requests that pass preflight.';
