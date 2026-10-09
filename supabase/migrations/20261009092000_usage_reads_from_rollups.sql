-- get_model_token_trajectory scanned every request fact (and a usage lateral
-- per fact) since the model's release on each call. Daily public usage rollups
-- hold the same token meters keyed by model slug. get_v2_model_quality_hourly_v1
-- probed every gateway_requests partition per fact for its legacy usage
-- fallback; bounding the probe to the fact's day lets it prune to one.
SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_model_token_trajectory(p_model_id text)
 RETURNS TABLE(release_date timestamp with time zone, deprecation_date timestamp with time zone, points jsonb, token_milestones jsonb, successor_milestones jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$with model_row as (
  select model_id, release_date, deprecation_date
  from private.v2_rpc_models_compat
  where model_id = p_model_id
  limit 1
),

-- Build the set of gateway_requests.model_id values to include
model_ids as (
  select p_model_id as model_id
  union
  select
    pm.provider_id || '/' || regexp_replace(pm.api_model_id, '^' || pm.provider_id || '/', '')
  from private.v2_rpc_routes_compat pm
  where pm.internal_model_id = p_model_id
),

anchors as (
  select
    mr.release_date,
    mr.deprecation_date,
    -- choose today's UTC day (not "greatest" vs release day; that could invert the range)
    date_trunc('day', now() at time zone 'utc') as today,
    date_trunc('day', mr.release_date) as start_day
  from model_row mr
),

-- Days after the release day come from daily usage rollups, which carry the
-- same token meters as raw request usage keyed by coalesce(routed, requested)
-- model slug. Facts without either slug are failed requests with no usage.
-- The release day itself is read from facts to keep the exact release-time
-- cutoff. Usage meters come from priced SKU meters, none of which is
-- total_tokens, so per-grain and per-request fallbacks agree.
release_day as (
  select (mr.release_date at time zone 'utc')::date as day,
    ((mr.release_date at time zone 'utc')::date + 1)::timestamp at time zone 'utc' as next_day_start
  from model_row mr
  where mr.release_date is not null
),

daily_tokens as (
  select grain.usage_date::timestamp as day,
    sum(coalesce(nullif(grain.explicit_total, 0),
      coalesce(grain.input_tokens, 0) + coalesce(grain.output_tokens, 0))) as tokens
  from (
    select rollup.usage_date,
      sum(meter.quantity) filter (where meter.meter_key = 'total_tokens') as explicit_total,
      sum(meter.quantity) filter (where meter.meter_key = 'input_tokens') as input_tokens,
      sum(meter.quantity) filter (where meter.meter_key = 'output_tokens') as output_tokens
    from public.v2_public_usage_daily rollup
    cross join release_day rd
    join public.v2_public_usage_daily_meters meter
      on meter.rollup_id = rollup.rollup_id
     and meter.meter_key in ('total_tokens', 'input_tokens', 'output_tokens')
    where rollup.model_slug in (select model_id from model_ids)
      and rollup.usage_date > rd.day
    group by rollup.rollup_id, rollup.usage_date
  ) grain
  group by 1
  union all
  select date_trunc('day', fact.occurred_at at time zone 'utc') as day,
    sum(coalesce(nullif(tokens.explicit_total, 0),
      coalesce(tokens.input_tokens, 0) + coalesce(tokens.output_tokens, 0))) as tokens
  from public.v2_request_facts fact
  cross join model_row mr
  cross join release_day rd
  left join lateral (
    select sum(usage.quantity) filter (where usage.meter_key = 'total_tokens') as explicit_total,
      sum(usage.quantity) filter (where usage.meter_key = 'input_tokens') as input_tokens,
      sum(usage.quantity) filter (where usage.meter_key = 'output_tokens') as output_tokens
    from public.v2_request_usage usage
    where usage.request_event_id = fact.request_event_id
      and usage.meter_key in ('total_tokens', 'input_tokens', 'output_tokens')
  ) tokens on true
  where coalesce(fact.routed_model_slug, fact.requested_model_slug, fact.requested_model_input)
      in (select model_id from model_ids)
    and fact.occurred_at >= mr.release_date
    and fact.occurred_at < rd.next_day_start
  group by 1
),

point_series as (
  select
    gs.day,
    coalesce(dt.tokens, 0) as tokens,
    sum(coalesce(dt.tokens, 0)) over (order by gs.day) as cumulative_tokens,
    floor(extract(epoch from (gs.day - (select release_date from model_row))) / 86400)::int as days_since_release
  from (
    select generate_series(
      (select start_day from anchors),
      (select today from anchors),
      interval '1 day'
    ) as day
  ) gs
  left join daily_tokens dt on dt.day = gs.day
),

points_json as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', to_char(day, 'YYYY-MM-DD"T"00:00:00.000Z'),
        'tokens', tokens,
        'cumulativeTokens', cumulative_tokens,
        'daysSinceRelease', days_since_release
      )
      order by day
    ),
    '[]'::jsonb
  ) as value
  from point_series
),

milestones as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'threshold', threshold,
        'reachedOn', reached_on,
        'daysSinceRelease', days_since_release
      )
      order by threshold
    ),
    '[]'::jsonb
  ) as value
  from (
    select
      threshold,
      (select to_char(ps.day, 'YYYY-MM-DD"T"00:00:00.000Z')
       from point_series ps
       where ps.cumulative_tokens >= threshold
       order by ps.day asc
       limit 1) as reached_on,
      (select ps.days_since_release
       from point_series ps
       where ps.cumulative_tokens >= threshold
       order by ps.day asc
       limit 1) as days_since_release
    from unnest(array[1000000, 10000000, 100000000, 1000000000]) as threshold
  ) m
),

successors as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'modelId', dm.model_id,
        'name', coalesce(dm.name, dm.model_id),
        'releaseDate', dm.release_date,
        'daysSinceRelease',
          case
            when mr.release_date is null or dm.release_date is null then null
            else floor(extract(epoch from (dm.release_date - mr.release_date)) / 86400)::int
          end
      )
    ),
    '[]'::jsonb
  ) as value
  from private.v2_rpc_models_compat dm
  cross join model_row mr
  where dm.previous_model_id = p_model_id
)

select
  (select release_date from model_row) as release_date,
  (select deprecation_date from model_row) as deprecation_date,
  (select value from points_json) as points,
  (select value from milestones) as token_milestones,
  (select value from successors) as successor_milestones
where (select release_date from model_row) is not null;$function$;

GRANT EXECUTE ON FUNCTION "public"."get_model_token_trajectory"(text) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_model_token_trajectory"(text) TO "service_role";

COMMENT ON FUNCTION "public"."get_model_token_trajectory"(text) IS 'Returns token trajectory (daily totals & cumulative), milestones, and successor milestones for a model.';

REVOKE ALL ON FUNCTION "public"."get_model_token_trajectory"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_model_token_trajectory"(text) TO "postgres";

CREATE OR REPLACE FUNCTION public.get_v2_model_quality_hourly_v1 (
  p_model_slug      text,
  p_cloudflare_colo text DEFAULT NULL::text,
  p_stream_mode     text DEFAULT 'all'::text,
  p_context_bucket  text DEFAULT 'all'::text
)
  RETURNS TABLE (
    bucket                            timestamp with time zone,
    requests                          bigint,
    tool_call_responses               bigint,
    tool_call_errors                  bigint,
    tool_invalid_json_errors          bigint,
    tool_schema_mismatch_errors       bigint,
    tool_unknown_name_errors          bigint,
    structured_output_responses       bigint,
    structured_output_errors          bigint,
    structured_invalid_json_errors    bigint,
    structured_schema_mismatch_errors bigint,
    structured_missing_output_errors  bigint,
    cache_telemetry_requests          bigint,
    input_tokens                      numeric,
    cached_read_tokens                numeric,
    cache_read_pct                    numeric
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
with params as not materialized (
  select
    lower(trim(p_model_slug)) model_slug,
    nullif(upper(trim(p_cloudflare_colo)), '') cloudflare_colo,
    case when lower(p_stream_mode) in ('stream', 'non_stream') then lower(p_stream_mode) else 'all' end stream_mode,
    case when lower(p_context_bucket) in ('lte_4k', '4k_16k', '16k_64k', 'gt_64k') then lower(p_context_bucket) else 'all' end context_bucket,
    now() now_ts
),
visible_model as (
  select model.model_slug
  from public.v2_models model
  cross join params
  where model.model_slug = params.model_slug
    and model.hidden = false
    and model.status <> 'disabled'
),
scoped_facts as (
  select
    fact.request_event_id,
    fact.workspace_id,
    fact.request_id,
    fact.occurred_at,
    fact.stream,
    fact.cloudflare_colo,
    fact.safe_metadata,
    fact.tool_call_count,
    fact.tool_call_succeeded,
    fact.structured_output_attempted,
    fact.structured_output_succeeded
  from public.v2_request_facts fact
  join visible_model
    on visible_model.model_slug = coalesce(fact.routed_model_slug, fact.requested_model_slug)
  cross join params
  where fact.occurred_at >= params.now_ts - interval '7 days'
    and (params.cloudflare_colo is null or upper(trim(fact.cloudflare_colo)) = params.cloudflare_colo)
    and (params.stream_mode = 'all' or fact.stream = (params.stream_mode = 'stream'))
),
usage_by_request as (
  select
    fact.*,
    coalesce(
      meters.input_tokens,
      legacy.usage_input_tokens::numeric
    )::numeric input_tokens,
    coalesce(
      meters.cached_read_tokens,
      legacy.usage_cached_read_tokens::numeric
    )::numeric cached_read_tokens,
    coalesce(meters.cache_telemetry_observed, false) or legacy.request_id is not null cache_telemetry_observed
  from scoped_facts fact
  left join lateral (
    select
      coalesce(
        sum(usage.quantity) filter (where usage.meter_key = 'input_tokens'),
        sum(usage.quantity) filter (where usage.meter_key = 'prompt_tokens'),
        sum(usage.quantity) filter (
          where usage.meter_key in (
            'input_text_tokens',
            'input_image_tokens',
            'input_audio_tokens',
            'input_video_tokens'
          )
        )
      )::numeric input_tokens,
      sum(usage.quantity) filter (
        where usage.meter_key in ('cached_input_tokens', 'cached_read_tokens')
      )::numeric cached_read_tokens,
      bool_or(usage.meter_key in ('cached_input_tokens', 'cached_read_tokens')) cache_telemetry_observed
    from public.v2_request_usage usage
    where usage.request_event_id = fact.request_event_id
  ) meters on true
  left join lateral (
    select
      request.request_id,
      request.usage_input_tokens,
      request.usage_cached_read_tokens
    from public.gateway_requests request
    where request.workspace_id = fact.workspace_id
      and request.request_id = fact.request_id
      -- The matching request is written within minutes of its fact. The bound
      -- lets each probe prune to one partition instead of searching all.
      and request.created_at >= fact.occurred_at - interval '1 day'
      and request.created_at < fact.occurred_at + interval '1 day'
    order by abs(extract(epoch from request.created_at - fact.occurred_at))
    limit 1
  ) legacy on true
),
classified as (
  select
    date_trunc('hour', fact.occurred_at) bucket_start,
    fact.input_tokens,
    fact.cached_read_tokens,
    fact.cache_telemetry_observed,
    case
      when fact.safe_metadata #>> '{tool_call_validation,totalCalls}' ~ '^\d+$'
        then (fact.safe_metadata #>> '{tool_call_validation,totalCalls}')::bigint
      when fact.tool_call_count > 0 then fact.tool_call_count::bigint
      else 0
    end tool_call_responses,
    case
      when fact.safe_metadata #>> '{tool_call_validation,invalidCalls}' ~ '^\d+$'
        then (fact.safe_metadata #>> '{tool_call_validation,invalidCalls}')::bigint
      when fact.tool_call_count > 0 and fact.tool_call_succeeded = false
        then fact.tool_call_count::bigint
      else 0
    end tool_call_errors,
    case
      when fact.safe_metadata #>> '{tool_call_validation,invalidJson}' ~ '^\d+$'
        then (fact.safe_metadata #>> '{tool_call_validation,invalidJson}')::bigint
      else 0
    end tool_invalid_json_errors,
    case
      when fact.safe_metadata #>> '{tool_call_validation,schemaMismatch}' ~ '^\d+$'
        then (fact.safe_metadata #>> '{tool_call_validation,schemaMismatch}')::bigint
      else 0
    end tool_schema_mismatch_errors,
    case
      when fact.safe_metadata #>> '{tool_call_validation,unknownToolName}' ~ '^\d+$'
        then (fact.safe_metadata #>> '{tool_call_validation,unknownToolName}')::bigint
      else 0
    end tool_unknown_name_errors,
    coalesce(
      fact.safe_metadata ->> 'structured_output_error_reason',
      case
        when fact.structured_output_attempted and fact.structured_output_succeeded then 'none'
        when fact.structured_output_attempted then 'legacy_error'
        else null
      end
    ) structured_error_reason,
    case
      when fact.input_tokens is null then null
      else fact.input_tokens
    end context_input_tokens
  from usage_by_request fact
),
base as (
  select classified.*
  from classified
  cross join params
  where
    params.context_bucket = 'all'
    or (params.context_bucket = 'lte_4k' and classified.context_input_tokens <= 4096)
    or (params.context_bucket = '4k_16k' and classified.context_input_tokens > 4096 and classified.context_input_tokens <= 16384)
    or (params.context_bucket = '16k_64k' and classified.context_input_tokens > 16384 and classified.context_input_tokens <= 65536)
    or (params.context_bucket = 'gt_64k' and classified.context_input_tokens > 65536)
),
hourly as (
  select
    base.bucket_start,
    count(*)::bigint requests,
    sum(base.tool_call_responses)::bigint tool_call_responses,
    sum(base.tool_call_errors)::bigint tool_call_errors,
    sum(base.tool_invalid_json_errors)::bigint tool_invalid_json_errors,
    sum(base.tool_schema_mismatch_errors)::bigint tool_schema_mismatch_errors,
    sum(base.tool_unknown_name_errors)::bigint tool_unknown_name_errors,
    count(*) filter (
      where base.structured_error_reason in ('none', 'invalid_json', 'schema_mismatch', 'missing_output', 'legacy_error')
    )::bigint structured_output_responses,
    count(*) filter (
      where base.structured_error_reason in ('invalid_json', 'schema_mismatch', 'missing_output', 'legacy_error')
    )::bigint structured_output_errors,
    count(*) filter (where base.structured_error_reason = 'invalid_json')::bigint structured_invalid_json_errors,
    count(*) filter (where base.structured_error_reason = 'schema_mismatch')::bigint structured_schema_mismatch_errors,
    count(*) filter (where base.structured_error_reason = 'missing_output')::bigint structured_missing_output_errors,
    count(*) filter (where base.cache_telemetry_observed)::bigint cache_telemetry_requests,
    sum(base.input_tokens) filter (
      where base.cache_telemetry_observed and base.input_tokens > 0
    )::numeric input_tokens,
    sum(base.cached_read_tokens) filter (
      where base.cache_telemetry_observed and base.input_tokens > 0
    )::numeric cached_read_tokens
  from base
  group by base.bucket_start
)
select
  hourly.bucket_start bucket,
  hourly.requests,
  hourly.tool_call_responses,
  hourly.tool_call_errors,
  hourly.tool_invalid_json_errors,
  hourly.tool_schema_mismatch_errors,
  hourly.tool_unknown_name_errors,
  hourly.structured_output_responses,
  hourly.structured_output_errors,
  hourly.structured_invalid_json_errors,
  hourly.structured_schema_mismatch_errors,
  hourly.structured_missing_output_errors,
  hourly.cache_telemetry_requests,
  case when hourly.cache_telemetry_requests >= 20 then hourly.input_tokens else null end,
  case when hourly.cache_telemetry_requests >= 20 then hourly.cached_read_tokens else null end,
  case
    when hourly.cache_telemetry_requests >= 20 and hourly.input_tokens > 0
      then least(100, coalesce(hourly.cached_read_tokens, 0) * 100.0 / hourly.input_tokens)
    else null
  end cache_read_pct
from hourly
order by hourly.bucket_start;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_quality_hourly_v1"(text, text, text, text) TO "service_role";

COMMENT ON FUNCTION "public"."get_v2_model_quality_hourly_v1"(text, text, text, text) IS 'Hourly tool-calling, structured-output, token, and cache aggregates, suppressed below twenty aggregated requests.';

REVOKE ALL ON FUNCTION "public"."get_v2_model_quality_hourly_v1"(text, text, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_quality_hourly_v1"(text, text, text, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_v2_model_quality_hourly_v1"(text, text, text, text) FROM PUBLIC, "anon", "authenticated";
