CREATE OR REPLACE FUNCTION public.ingest_v2_gateway_request (
  p_event jsonb
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_request_event_id uuid;
  v_workspace_id uuid;
  v_request_id text;
  v_requested_input text;
  v_requested_model_slug text;
  v_routed_model_slug text;
  v_provider text;
  v_provider_api_model_id text;
  v_provider_model_id text;
  v_attempts jsonb := coalesce(p_event->'attempts', '[]'::jsonb);
  v_usage jsonb := coalesce(p_event->'usage_meters', '[]'::jsonb);
  v_pricing jsonb := coalesce(p_event->'pricing_lines', '[]'::jsonb);
  v_safe_metadata jsonb := coalesce(p_event->'safe_metadata', '{}'::jsonb);
  v_occurred_at timestamptz := coalesce(nullif(p_event->>'occurred_at', '')::timestamptz, now());
begin
  if jsonb_typeof(p_event) <> 'object' then
    raise exception using errcode = '22023', message = 'gateway_event_must_be_object';
  end if;

  v_workspace_id := nullif(p_event->>'workspace_id', '')::uuid;
  v_request_id := nullif(trim(p_event->>'request_id'), '');
  v_requested_input := nullif(trim(p_event->>'requested_model_input'), '');
  v_provider := nullif(trim(p_event->>'provider'), '');
  v_provider_api_model_id := nullif(trim(p_event->>'provider_api_model_id'), '');

  if v_workspace_id is null or v_request_id is null or v_requested_input is null then
    raise exception using errcode = '22023', message = 'gateway_event_missing_identity';
  end if;
  if length(v_request_id) > 256 or length(v_requested_input) > 512 then
    raise exception using errcode = '22023', message = 'gateway_event_identity_too_long';
  end if;
  if jsonb_typeof(v_attempts) <> 'array' then
    raise exception using errcode = '22023', message = 'gateway_event_attempts_invalid';
  end if;
  if jsonb_array_length(v_attempts) > 128 then
    raise exception using errcode = '22023', message = 'gateway_event_attempts_invalid';
  end if;
  if jsonb_typeof(v_usage) <> 'array' then
    raise exception using errcode = '22023', message = 'gateway_event_usage_invalid';
  end if;
  if jsonb_array_length(v_usage) > 256 then
    raise exception using errcode = '22023', message = 'gateway_event_usage_invalid';
  end if;
  if jsonb_typeof(v_pricing) <> 'array' then
    raise exception using errcode = '22023', message = 'gateway_event_pricing_invalid';
  end if;
  if jsonb_array_length(v_pricing) > 256 then
    raise exception using errcode = '22023', message = 'gateway_event_pricing_invalid';
  end if;
  if jsonb_typeof(v_safe_metadata) <> 'object' or pg_column_size(v_safe_metadata) > 16384 then
    raise exception using errcode = '22023', message = 'gateway_event_safe_metadata_invalid';
  end if;

  -- Serialize retries/concurrent finalizers for the same logical request.
  perform pg_advisory_xact_lock(hashtextextended(v_workspace_id::text || ':' || v_request_id, 0));

  select model.model_slug into v_requested_model_slug
  from public.v2_models model
  where model.model_slug = lower(v_requested_input)
  limit 1;
  if v_requested_model_slug is null then
    select alias.model_slug into v_requested_model_slug
    from public.v2_model_aliases alias
    where alias.alias_slug = lower(v_requested_input) and alias.enabled = true
    limit 1;
  end if;

  select model.model_slug into v_routed_model_slug
  from public.v2_models model
  where model.model_slug = lower(coalesce(nullif(trim(p_event->>'routed_model_slug'), ''), v_requested_model_slug, v_requested_input))
  limit 1;
  v_routed_model_slug := coalesce(v_routed_model_slug, v_requested_model_slug);

  if nullif(trim(p_event->>'provider_model_id'), '') is not null then
    select route.provider_model_id into v_provider_model_id
    from public.v2_model_provider_routes route
    where route.provider_model_id = trim(p_event->>'provider_model_id')
    limit 1;
  end if;
  if v_provider_model_id is null and v_provider is not null then
    select route.provider_model_id into v_provider_model_id
    from public.v2_model_provider_routes route
    where route.provider_slug = v_provider
      and (v_routed_model_slug is null or route.model_slug = v_routed_model_slug)
    order by
      case
        when v_provider_api_model_id is not null and route.provider_model_slug = v_provider_api_model_id then 0
        when v_provider_api_model_id is not null and route.provider_model_id = v_provider || ':' || v_provider_api_model_id then 1
        else 2
      end,
      case when route.routing_enabled then 0 else 1 end,
      route.provider_model_id
    limit 1;
  end if;

  insert into public.v2_request_facts (
    workspace_id, request_id, occurred_at, app_id, key_id, endpoint,
    requested_model_input, requested_model_slug, routed_model_slug, provider_model_id,
    status_code, success, error_code, stop_reason, tool_call_count, tool_call_succeeded,
    structured_output_attempted, structured_output_succeeded, stream, byok,
    latency_ms, time_to_first_token_ms, generation_ms, internal_dispatch_ms,
    gateway_total_ms, upstream_attempt_count, throughput, user_agent,
    session_id, end_user_id, auth_method, native_response_id, cost_nanos, currency,
    cloudflare_colo, safe_metadata
  ) values (
    v_workspace_id, v_request_id, v_occurred_at,
    nullif(p_event->>'app_id', '')::uuid, nullif(p_event->>'key_id', '')::uuid,
    coalesce(nullif(trim(p_event->>'endpoint'), ''), 'unknown'),
    v_requested_input, v_requested_model_slug, v_routed_model_slug, v_provider_model_id,
    nullif(p_event->>'status_code', '')::integer, coalesce((p_event->>'success')::boolean, false),
    nullif(p_event->>'error_code', ''), nullif(p_event->>'stop_reason', ''),
    greatest(0, coalesce((p_event->>'tool_call_count')::integer, 0)),
    case when coalesce((p_event->>'tool_call_count')::integer, 0) > 0 then (p_event->>'tool_call_succeeded')::boolean else null end,
    coalesce((p_event->>'structured_output_attempted')::boolean, false),
    coalesce((p_event->>'structured_output_succeeded')::boolean, false),
    coalesce((p_event->>'stream')::boolean, false), coalesce((p_event->>'byok')::boolean, false),
    nullif(p_event->>'latency_ms', '')::integer,
    nullif(p_event->>'latency_ms', '')::integer,
    nullif(p_event->>'generation_ms', '')::integer,
    nullif(p_event->>'internal_dispatch_ms', '')::numeric,
    nullif(p_event->>'gateway_total_ms', '')::numeric,
    least(32767, jsonb_array_length(v_attempts))::smallint,
    nullif(p_event->>'throughput', '')::numeric,
    left(nullif(p_event->>'user_agent', ''), 1024),
    left(nullif(p_event->>'session_id', ''), 256),
    left(nullif(p_event->>'end_user_id', ''), 256),
    nullif(p_event->>'auth_method', ''),
    left(nullif(p_event->>'native_response_id', ''), 512),
    nullif(p_event->>'cost_nanos', '')::bigint,
    left(nullif(p_event->>'currency', ''), 8),
    nullif(upper(trim(p_event->>'cloudflare_colo')), ''),
    v_safe_metadata
  )
  on conflict (workspace_id, request_id) do update set
    occurred_at = excluded.occurred_at,
    app_id = excluded.app_id,
    key_id = excluded.key_id,
    endpoint = excluded.endpoint,
    requested_model_input = excluded.requested_model_input,
    requested_model_slug = excluded.requested_model_slug,
    routed_model_slug = excluded.routed_model_slug,
    provider_model_id = excluded.provider_model_id,
    status_code = excluded.status_code,
    success = excluded.success,
    error_code = excluded.error_code,
    stop_reason = excluded.stop_reason,
    tool_call_count = excluded.tool_call_count,
    tool_call_succeeded = excluded.tool_call_succeeded,
    structured_output_attempted = excluded.structured_output_attempted,
    structured_output_succeeded = excluded.structured_output_succeeded,
    stream = excluded.stream,
    byok = excluded.byok,
    latency_ms = excluded.latency_ms,
    time_to_first_token_ms = excluded.time_to_first_token_ms,
    generation_ms = excluded.generation_ms,
    internal_dispatch_ms = excluded.internal_dispatch_ms,
    gateway_total_ms = excluded.gateway_total_ms,
    upstream_attempt_count = excluded.upstream_attempt_count,
    throughput = excluded.throughput,
    user_agent = excluded.user_agent,
    session_id = excluded.session_id,
    end_user_id = excluded.end_user_id,
    auth_method = excluded.auth_method,
    native_response_id = excluded.native_response_id,
    cost_nanos = excluded.cost_nanos,
    currency = excluded.currency,
    cloudflare_colo = excluded.cloudflare_colo,
    safe_metadata = excluded.safe_metadata
  returning request_event_id into v_request_event_id;

  delete from public.v2_request_attempts attempt
  where attempt.request_event_id = v_request_event_id;

  insert into public.v2_request_attempts (
    request_event_id, attempt_number, provider_model_id, status_code, success,
    error_code, failure_class, upstream_response_id, latency_ms, cloudflare_colo, safe_metadata
  )
  select
    v_request_event_id,
    greatest(1, coalesce((item.value->>'attempt_number')::integer, item.ordinality::integer)),
    route.provider_model_id,
    nullif(item.value->>'status_code', '')::integer,
    coalesce((item.value->>'success')::boolean, false),
    nullif(item.value->>'error_code', ''),
    nullif(item.value->>'failure_class', ''),
    left(nullif(item.value->>'upstream_response_id', ''), 512),
    nullif(item.value->>'latency_ms', '')::integer,
    nullif(upper(trim(p_event->>'cloudflare_colo')), ''),
    jsonb_strip_nulls(jsonb_build_object(
      'provider', nullif(item.value->>'provider', ''),
      'credential_phase', nullif(item.value->>'credential_phase', ''),
      'key_source', nullif(item.value->>'key_source', ''),
      'response_kind', nullif(item.value->>'response_kind', ''),
      'retryable', nullif(item.value->>'retryable', '')::boolean,
      'was_probe', coalesce((item.value->>'was_probe')::boolean, false)
    ))
  from jsonb_array_elements(v_attempts) with ordinality as item(value, ordinality)
  left join lateral (
    select candidate.provider_model_id
    from public.v2_model_provider_routes candidate
    where candidate.provider_slug = nullif(item.value->>'provider', '')
      and (v_routed_model_slug is null or candidate.model_slug = v_routed_model_slug)
    order by
      case when nullif(item.value->>'provider_api_model_id', '') is not null
        and candidate.provider_model_slug = item.value->>'provider_api_model_id' then 0 else 1 end,
      candidate.provider_model_id
    limit 1
  ) route on true;

  delete from public.v2_request_usage usage
  where usage.request_event_id = v_request_event_id;

  insert into public.v2_request_usage (
    request_event_id, sku_meter_id, meter_key, modality, unit, quantity, source, billable, sequence
  )
  select
    v_request_event_id, meter.sku_meter_id,
    lower(item.value->>'meter_key'), lower(item.value->>'modality'), lower(item.value->>'unit'),
    greatest(0, (item.value->>'quantity')::numeric),
    coalesce(nullif(item.value->>'source', ''), 'gateway'),
    coalesce((item.value->>'billable')::boolean, true),
    greatest(0, coalesce((item.value->>'sequence')::integer, item.ordinality::integer - 1))
  from jsonb_array_elements(v_usage) with ordinality as item(value, ordinality)
  left join lateral (
    select sku_meter.sku_meter_id
    from public.v2_pricing_sku_meters sku_meter
    join public.v2_pricing_skus sku on sku.sku_id = sku_meter.sku_id
    where sku.provider_model_id = v_provider_model_id
      and sku_meter.meter_key = lower(item.value->>'meter_key')
      and sku.status = 'active'
      and sku.effective_from <= v_occurred_at
      and (sku.effective_to is null or sku.effective_to > v_occurred_at)
    order by sku.version desc, sku.effective_from desc
    limit 1
  ) meter on true
  where coalesce((item.value->>'quantity')::numeric, 0) > 0;

  delete from public.v2_request_pricing_lines pricing
  where pricing.request_event_id = v_request_event_id;

  insert into public.v2_request_pricing_lines (
    request_event_id, sku_id, sku_meter_id, meter_key, quantity, unit,
    unit_price_nanos, charged_nanos
  )
  select
    v_request_event_id, meter.sku_id, meter.sku_meter_id,
    lower(item.value->>'meter_key'),
    greatest(0, (item.value->>'quantity')::numeric),
    lower(coalesce(nullif(item.value->>'unit', ''), 'unit')),
    greatest(0, coalesce((item.value->>'unit_price_nanos')::numeric, 0)),
    greatest(0, coalesce((item.value->>'charged_nanos')::bigint, 0))
  from jsonb_array_elements(v_pricing) as item(value)
  left join lateral (
    select sku.sku_id, sku_meter.sku_meter_id
    from public.v2_pricing_skus sku
    left join public.v2_pricing_sku_meters sku_meter
      on sku_meter.sku_id = sku.sku_id
      and sku_meter.meter_key = lower(item.value->>'meter_key')
    where sku.provider_model_id = v_provider_model_id
      and sku.status = 'active'
      and sku.effective_from <= v_occurred_at
      and (sku.effective_to is null or sku.effective_to > v_occurred_at)
    order by sku.version desc, sku.effective_from desc
    limit 1
  ) meter on true;

  insert into public.v2_analytics_outbox (
    request_event_id, workspace_id, occurred_at, status, attempt_count,
    available_at, last_error, updated_at
  ) values (
    v_request_event_id, v_workspace_id, v_occurred_at, 'pending', 0,
    now(), null, now()
  )
  on conflict (request_event_id) do update set
    workspace_id = excluded.workspace_id,
    occurred_at = excluded.occurred_at,
    status = 'pending',
    attempt_count = 0,
    available_at = now(),
    last_error = null,
    updated_at = now();

  return v_request_event_id;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."ingest_v2_gateway_request"(jsonb) TO "service_role";

COMMENT ON FUNCTION "public"."ingest_v2_gateway_request"(jsonb) IS 'Service-only, idempotent and atomic ingestion of content-free gateway request facts, attempts, usage, pricing, and analytics outbox state.';

REVOKE ALL ON FUNCTION "public"."ingest_v2_gateway_request"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."ingest_v2_gateway_request"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."ingest_v2_gateway_request"(jsonb) FROM PUBLIC, "anon", "authenticated";
