CREATE OR REPLACE FUNCTION public.ingest_v2_gateway_request_with_routing (
  p_event jsonb
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_request_event_id uuid;
  v_attempts jsonb := coalesce(p_event->'attempts', '[]'::jsonb);
  v_routing_decisions jsonb := coalesce(p_event->'routing_decisions', '[]'::jsonb);
  v_routing_trace jsonb := coalesce(p_event->'routing_trace', '{}'::jsonb);
begin
  if jsonb_typeof(v_routing_decisions) <> 'array'
     or jsonb_array_length(v_routing_decisions) > 128
     or jsonb_typeof(v_routing_trace) <> 'object'
     or pg_column_size(v_routing_trace) > 32768 then
    raise exception using errcode = '22023', message = 'gateway_event_routing_trace_invalid';
  end if;

  v_request_event_id := public.ingest_v2_gateway_request(
    p_event - 'routing_decisions' - 'routing_trace'
  );

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
    score_factors, score_trace
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
    coalesce(item.value->'score_factors', '{}'::jsonb),
    coalesce(item.value->'score_trace', '{}'::jsonb)
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

  insert into public.v2_request_routing_traces (
    request_event_id, algorithm_version, random_seed, selection_method,
    routing_mode, priority, requested_model, endpoint, final_candidate_count,
    pool_bounds, requested_routing, sticky_routing
  ) values (
    v_request_event_id,
    left(nullif(v_routing_trace#>>'{algorithm,version}', ''), 128),
    nullif(v_routing_trace#>>'{algorithm,seed}', '')::bigint,
    left(nullif(v_routing_trace#>>'{algorithm,selectionMethod}', ''), 64),
    left(nullif(v_routing_trace->>'routing_mode', ''), 64),
    left(nullif(v_routing_trace->>'priority', ''), 64),
    left(nullif(v_routing_trace->>'model', ''), 512),
    left(nullif(v_routing_trace->>'endpoint', ''), 128),
    nullif(v_routing_trace->>'final_candidate_count', '')::integer,
    coalesce(v_routing_trace#>'{algorithm,poolBounds}', '{}'::jsonb),
    coalesce(v_routing_trace->'requested_routing', '{}'::jsonb),
    coalesce(v_routing_trace->'sticky_routing', '{}'::jsonb)
  )
  on conflict (request_event_id) do update set
    algorithm_version = excluded.algorithm_version,
    random_seed = excluded.random_seed,
    selection_method = excluded.selection_method,
    routing_mode = excluded.routing_mode,
    priority = excluded.priority,
    requested_model = excluded.requested_model,
    endpoint = excluded.endpoint,
    final_candidate_count = excluded.final_candidate_count,
    pool_bounds = excluded.pool_bounds,
    requested_routing = excluded.requested_routing,
    sticky_routing = excluded.sticky_routing;

  return v_request_event_id;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."ingest_v2_gateway_request_with_routing"(jsonb) TO "service_role";

COMMENT ON FUNCTION "public"."ingest_v2_gateway_request_with_routing"(jsonb) IS 'Atomically ingests request telemetry while preserving exact provider/model route identities.';

REVOKE ALL ON FUNCTION "public"."ingest_v2_gateway_request_with_routing"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."ingest_v2_gateway_request_with_routing"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."ingest_v2_gateway_request_with_routing"(jsonb) FROM PUBLIC, "anon", "authenticated";
