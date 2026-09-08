-- Recovered from the production supabase_migrations.schema_migrations ledger.
-- Original version and SQL are retained; this migration is already applied in production.

CREATE OR REPLACE FUNCTION public.get_v2_model_quality_hourly_v1(p_model_slug text, p_cloudflare_colo text DEFAULT NULL::text, p_stream_mode text DEFAULT 'all'::text, p_context_bucket text DEFAULT 'all'::text)
 RETURNS TABLE(bucket timestamp with time zone, requests bigint, tool_call_responses bigint, tool_call_errors bigint, tool_invalid_json_errors bigint, tool_schema_mismatch_errors bigint, tool_unknown_name_errors bigint, structured_output_responses bigint, structured_output_errors bigint, structured_invalid_json_errors bigint, structured_schema_mismatch_errors bigint, structured_missing_output_errors bigint, cache_telemetry_requests bigint, input_tokens numeric, cached_read_tokens numeric, cache_read_pct numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
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
$function$

