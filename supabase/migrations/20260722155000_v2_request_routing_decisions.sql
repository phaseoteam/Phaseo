-- Durable, content-free routing transparency for each gateway request.
-- One row represents either a scored/ranked candidate or a provider excluded
-- by a routing gate. Raw request/provider payloads never belong here.

create table if not exists public.v2_request_routing_decisions (
  routing_decision_id bigint generated always as identity primary key,
  request_event_id uuid not null references public.v2_request_facts(request_event_id) on delete cascade,
  decision_order smallint not null,
  provider_model_id text references public.v2_model_provider_routes(provider_model_id) on delete set null,
  provider_slug text not null,
  provider_api_model_id text,
  decision text not null,
  rank smallint,
  score numeric(20, 12),
  selected boolean not null default false,
  attempted boolean not null default false,
  breaker text,
  breaker_until timestamptz,
  provider_status text,
  provider_routing_status text,
  model_routing_status text,
  capability_status text,
  exclusion_stage text,
  exclusion_reason text,
  score_factors jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint v2_request_routing_decisions_order_check check (decision_order > 0),
  constraint v2_request_routing_decisions_decision_check check (decision in ('ranked', 'excluded')),
  constraint v2_request_routing_decisions_rank_check check (rank is null or rank > 0),
  constraint v2_request_routing_decisions_score_check check (score is null or score >= 0),
  constraint v2_request_routing_decisions_factors_check check (
    jsonb_typeof(score_factors) = 'object' and pg_column_size(score_factors) <= 4096
  ),
  constraint v2_request_routing_decisions_request_order_key unique (request_event_id, decision_order)
);

create index if not exists v2_request_routing_decisions_request_idx
  on public.v2_request_routing_decisions (request_event_id, decision_order);
create index if not exists v2_request_routing_decisions_route_idx
  on public.v2_request_routing_decisions (provider_model_id, created_at desc)
  where provider_model_id is not null;
create index if not exists v2_request_routing_decisions_excluded_idx
  on public.v2_request_routing_decisions (exclusion_reason, created_at desc)
  where decision = 'excluded';

alter table public.v2_request_routing_decisions enable row level security;

drop policy if exists v2_request_routing_decisions_workspace_select
  on public.v2_request_routing_decisions;
create policy v2_request_routing_decisions_workspace_select
  on public.v2_request_routing_decisions
  for select to authenticated
  using (exists (
    select 1
    from public.v2_request_facts request
    where request.request_event_id = v2_request_routing_decisions.request_event_id
      and (select public.is_workspace_member(request.workspace_id))
  ));

grant select on public.v2_request_routing_decisions to authenticated;
grant select, insert, update, delete on public.v2_request_routing_decisions to service_role;

create or replace function public.ingest_v2_gateway_request_with_routing(p_event jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_event_id uuid;
  v_routing_decisions jsonb := coalesce(p_event->'routing_decisions', '[]'::jsonb);
begin
  if jsonb_typeof(v_routing_decisions) <> 'array'
     or jsonb_array_length(v_routing_decisions) > 128 then
    raise exception using errcode = '22023', message = 'gateway_event_routing_decisions_invalid';
  end if;

  -- The nested function executes in this transaction. Any decision failure
  -- rolls back the request fact, attempts, usage, pricing, and outbox together.
  v_request_event_id := public.ingest_v2_gateway_request(p_event - 'routing_decisions');

  delete from public.v2_request_routing_decisions decision
  where decision.request_event_id = v_request_event_id;

  insert into public.v2_request_routing_decisions (
    request_event_id, decision_order, provider_model_id, provider_slug,
    provider_api_model_id, decision, rank, score, selected, attempted,
    breaker, breaker_until, provider_status, provider_routing_status,
    model_routing_status, capability_status, exclusion_stage, exclusion_reason,
    score_factors
  )
  select
    v_request_event_id,
    greatest(1, coalesce((item.value->>'decision_order')::integer, item.ordinality::integer)),
    route.provider_model_id,
    left(nullif(trim(item.value->>'provider'), ''), 256),
    left(nullif(trim(item.value->>'provider_api_model_id'), ''), 512),
    coalesce(nullif(item.value->>'decision', ''), 'ranked'),
    nullif(item.value->>'rank', '')::integer,
    nullif(item.value->>'score', '')::numeric,
    coalesce((item.value->>'selected')::boolean, false),
    coalesce((item.value->>'attempted')::boolean, false),
    left(nullif(item.value->>'breaker', ''), 64),
    case
      when nullif(item.value->>'breaker_until_ms', '') is null then null
      else to_timestamp((item.value->>'breaker_until_ms')::double precision / 1000.0)
    end,
    left(nullif(item.value->>'provider_status', ''), 64),
    left(nullif(item.value->>'provider_routing_status', ''), 64),
    left(nullif(item.value->>'model_routing_status', ''), 64),
    left(nullif(item.value->>'capability_status', ''), 64),
    left(nullif(item.value->>'exclusion_stage', ''), 128),
    left(nullif(item.value->>'exclusion_reason', ''), 256),
    coalesce(item.value->'score_factors', '{}'::jsonb)
  from jsonb_array_elements(v_routing_decisions) with ordinality as item(value, ordinality)
  left join lateral (
    select candidate.provider_model_id
    from public.v2_model_provider_routes candidate
    where candidate.provider_slug = nullif(item.value->>'provider', '')
    order by
      case when nullif(item.value->>'provider_api_model_id', '') is not null
        and candidate.provider_model_slug = item.value->>'provider_api_model_id' then 0 else 1 end,
      candidate.provider_model_id
    limit 1
  ) route on true
  where nullif(trim(item.value->>'provider'), '') is not null;

  return v_request_event_id;
end;
$$;

revoke all on function public.ingest_v2_gateway_request_with_routing(jsonb)
  from public, anon, authenticated;
grant execute on function public.ingest_v2_gateway_request_with_routing(jsonb)
  to service_role;

comment on table public.v2_request_routing_decisions is
  'Content-free scored/ranked and excluded provider decisions used to explain routing for one gateway request.';
comment on column public.v2_request_routing_decisions.score_factors is
  'Bounded scalar score components only; request content, secrets, provider payloads, and error bodies are prohibited.';
comment on function public.ingest_v2_gateway_request_with_routing(jsonb) is
  'Atomic service-only ingestion of request facts, attempts, usage, pricing, routing decisions, and analytics outbox state.';
