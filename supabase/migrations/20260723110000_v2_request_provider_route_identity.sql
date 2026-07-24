-- Preserve the exact v2 provider/model route selected by the gateway.
-- Legacy provider API-model IDs are not stable catalogue route identities.

create or replace function public.ingest_v2_gateway_request_with_routing(p_event jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_event_id uuid;
  v_attempts jsonb := coalesce(p_event->'attempts', '[]'::jsonb);
  v_routing_decisions jsonb := coalesce(p_event->'routing_decisions', '[]'::jsonb);
begin
  if jsonb_typeof(v_routing_decisions) <> 'array'
     or jsonb_array_length(v_routing_decisions) > 128 then
    raise exception using errcode = '22023', message = 'gateway_event_routing_decisions_invalid';
  end if;

  v_request_event_id := public.ingest_v2_gateway_request(p_event - 'routing_decisions');

  -- The base ingestion function predates exact route IDs on attempt events.
  -- Repair those rows atomically before exposing the completed request.
  update public.v2_request_attempts attempt
  set provider_model_id = route.provider_model_id
  from jsonb_array_elements(v_attempts) with ordinality as item(value, ordinality)
  cross join lateral (
    select candidate.provider_model_id
    from public.v2_model_provider_routes candidate
    where candidate.provider_model_id = nullif(item.value->>'provider_model_id', '')
       or (
         candidate.provider_slug = nullif(item.value->>'provider', '')
         and candidate.provider_model_id =
           nullif(item.value->>'provider', '') || ':' || nullif(item.value->>'provider_api_model_id', '')
       )
       or (
         candidate.provider_slug = nullif(item.value->>'provider', '')
         and candidate.provider_model_slug = nullif(item.value->>'provider_api_model_id', '')
       )
    order by
      case when candidate.provider_model_id = nullif(item.value->>'provider_model_id', '') then 0 else 1 end,
      candidate.provider_model_id
    limit 1
  ) route
  where attempt.request_event_id = v_request_event_id
    and attempt.attempt_number = greatest(
      1,
      coalesce((item.value->>'attempt_number')::integer, item.ordinality::integer)
    );

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
    where candidate.provider_model_id = nullif(item.value->>'provider_model_id', '')
       or (
         candidate.provider_slug = nullif(item.value->>'provider', '')
         and candidate.provider_model_id =
           nullif(item.value->>'provider', '') || ':' || nullif(item.value->>'provider_api_model_id', '')
       )
       or (
         candidate.provider_slug = nullif(item.value->>'provider', '')
         and candidate.provider_model_slug = nullif(item.value->>'provider_api_model_id', '')
       )
    order by
      case when candidate.provider_model_id = nullif(item.value->>'provider_model_id', '') then 0 else 1 end,
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

comment on function public.ingest_v2_gateway_request_with_routing(jsonb) is
  'Atomically ingests request telemetry while preserving exact provider/model route identities.';
