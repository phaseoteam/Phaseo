CREATE OR REPLACE FUNCTION public.get_public_compare_realtime (
  p_model_ids      text[],
  p_window_minutes integer DEFAULT 30
)
  RETURNS TABLE (
    model_id                text,
    realtime_requests       bigint,
    realtime_latency_p50    numeric,
    realtime_throughput_p50 numeric
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  with selected as (
    select model.model_id
    from private.v2_rpc_models_compat model
    where model.hidden = false
      and model.model_id = any(coalesce(p_model_ids, array[]::text[]))
  ),
  aliases as (
    select selected.model_id, selected.model_id as alias_id from selected
    union
    select selected.model_id, provider_model.model_id
    from selected
    join private.v2_rpc_routes_compat provider_model
      on provider_model.model_id = selected.model_id or provider_model.api_model_id = selected.model_id
    where provider_model.model_id is not null and btrim(provider_model.model_id) <> ''
    union
    select selected.model_id, provider_model.api_model_id
    from selected
    join private.v2_rpc_routes_compat provider_model
      on provider_model.model_id = selected.model_id or provider_model.api_model_id = selected.model_id
    where provider_model.api_model_id is not null and btrim(provider_model.api_model_id) <> ''
  ),
  realtime_samples as (
    select
      alias.model_id,
      request.latency_ms::numeric as latency_ms,
      case
        when request.throughput > 0 then request.throughput::numeric
        when request.generation_ms > 0 then
          coalesce(
            case when request.usage->>'output_tokens' ~ '^[0-9]+(?:\.[0-9]+)?$' then (request.usage->>'output_tokens')::numeric end,
            case when request.usage->>'completion_tokens' ~ '^[0-9]+(?:\.[0-9]+)?$' then (request.usage->>'completion_tokens')::numeric end,
            case when request.usage->>'generated_tokens' ~ '^[0-9]+(?:\.[0-9]+)?$' then (request.usage->>'generated_tokens')::numeric end,
            case when request.usage->>'response_tokens' ~ '^[0-9]+(?:\.[0-9]+)?$' then (request.usage->>'response_tokens')::numeric end,
            case when request.usage->>'total_tokens' ~ '^[0-9]+(?:\.[0-9]+)?$' then (request.usage->>'total_tokens')::numeric end
          ) * 1000 / request.generation_ms
        else null
      end as throughput
    from aliases alias
    join private.v2_rpc_gateway_requests_compat request on request.model_id = alias.alias_id
    where request.created_at >= now() - make_interval(mins => greatest(1, least(coalesce(p_window_minutes, 30), 1440)))
      and request.created_at <= now()
  ),
  realtime as (
    select
      sample.model_id,
      count(*)::bigint as requests,
      percentile_cont(0.5) within group (order by sample.latency_ms) filter (where sample.latency_ms > 0)::numeric as latency_p50,
      percentile_cont(0.5) within group (order by sample.throughput) filter (where sample.throughput > 0)::numeric as throughput_p50
    from realtime_samples sample
    group by sample.model_id
  )
  select
    selected.model_id,
    coalesce(realtime.requests, 0),
    realtime.latency_p50,
    realtime.throughput_p50
  from selected
  left join realtime on realtime.model_id = selected.model_id
  order by array_position(p_model_ids, selected.model_id);
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_public_compare_realtime"(text[], integer) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_public_compare_realtime"(text[], integer) TO "service_role";

COMMENT ON FUNCTION "public"."get_public_compare_realtime"(text[], integer) IS 'Returns batched realtime request medians for a visible comparison selection without sending raw gateway requests to the Worker.';

REVOKE ALL ON FUNCTION "public"."get_public_compare_realtime"(text[], integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_public_compare_realtime"(text[], integer) TO "postgres";
