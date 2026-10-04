CREATE OR REPLACE FUNCTION public.get_gateway_request_facets (
  p_workspace_id uuid,
  p_from         timestamp with time zone,
  p_to           timestamp with time zone
)
  RETURNS TABLE (
    facet         text,
    value         text,
    value_label   text,
    request_count bigint
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with scoped as materialized (
    select
      gr.model_id,
      gr.provider,
      gr.app_id::text as app_id,
	  gr.key_id::text as key_id,
      gr.endpoint,
	  case when gr.stream then 'streaming' else 'non_streaming' end as stream_mode,
      gr.finish_reason,
      gr.error_code,
      gr.status_code::text as status_code,
      case when gr.success then 'success' else 'error' end as request_status,
      gr.client_source_id,
      gr.client_source_name
    from public.gateway_requests gr
    where gr.workspace_id = p_workspace_id
      and gr.created_at >= p_from
      and gr.created_at <= p_to
      and gr.endpoint not in ('video.generation', 'batch', 'music.generate')
  )
  select 'model', model_id, null::text, count(*) from scoped where model_id is not null group by model_id
  union all
  select 'provider', provider, null::text, count(*) from scoped where provider is not null group by provider
  union all
  select 'app', app_id, null::text, count(*) from scoped where app_id is not null group by app_id
  union all
	select 'key', key_id, null::text, count(*) from scoped where key_id is not null group by key_id
	union all
  select 'endpoint', endpoint, null::text, count(*) from scoped where endpoint is not null group by endpoint
  union all
	select 'stream', stream_mode, null::text, count(*) from scoped group by stream_mode
	union all
  select 'finish_reason', finish_reason, null::text, count(*) from scoped where finish_reason is not null group by finish_reason
  union all
  select 'error_code', error_code, null::text, count(*) from scoped where error_code is not null group by error_code
  union all
  select 'http_status', status_code, null::text, count(*) from scoped where status_code is not null group by status_code
  union all
  select 'status', request_status, null::text, count(*) from scoped group by request_status
  union all
  select 'source', client_source_id, max(client_source_name), count(*) from scoped where client_source_id is not null group by client_source_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_gateway_request_facets (
  p_workspace_id uuid,
  p_from         timestamp with time zone,
  p_to           timestamp with time zone,
  p_filters      jsonb
)
  RETURNS TABLE (
    facet         text,
    value         text,
    value_label   text,
    request_count bigint
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with scoped as materialized (
    select
      gr.model_id,
      gr.provider,
      gr.app_id::text as app_id,
      gr.key_id::text as key_id,
      gr.endpoint,
      case when gr.stream then 'streaming' else 'non_streaming' end as stream_mode,
      gr.finish_reason,
      gr.error_code,
      gr.status_code::text as status_code,
      case when gr.success then 'success' else 'error' end as request_status,
      gr.client_source_id,
      gr.client_source_name
    from public.gateway_requests gr
    where gr.workspace_id = p_workspace_id
      and gr.created_at >= p_from
      and gr.created_at <= p_to
      and gr.endpoint not in ('video.generation', 'batch', 'music.generate')
      and (not (p_filters ? 'model') or case when p_filters->>'model_op' = 'is_not' then gr.model_id is distinct from p_filters->>'model' else gr.model_id = p_filters->>'model' end)
      and (not (p_filters ? 'provider') or case when p_filters->>'provider_op' = 'is_not' then gr.provider is distinct from p_filters->>'provider' else gr.provider = p_filters->>'provider' end)
      and (not (p_filters ? 'app') or case when p_filters->>'app_op' = 'is_not' then gr.app_id::text is distinct from p_filters->>'app' else gr.app_id::text = p_filters->>'app' end)
      and (not (p_filters ? 'key') or case when p_filters->>'key_op' = 'is_not' then gr.key_id::text is distinct from p_filters->>'key' else gr.key_id::text = p_filters->>'key' end)
      and (not (p_filters ? 'endpoint') or case when p_filters->>'endpoint_op' = 'is_not' then gr.endpoint is distinct from p_filters->>'endpoint' else gr.endpoint = p_filters->>'endpoint' end)
      and (not (p_filters ? 'finish_reason') or case when p_filters->>'finish_op' = 'is_not' then gr.finish_reason is distinct from p_filters->>'finish_reason' else gr.finish_reason = p_filters->>'finish_reason' end)
      and (not (p_filters ? 'error_code') or case when p_filters->>'error_op' = 'is_not' then gr.error_code is distinct from p_filters->>'error_code' else gr.error_code = p_filters->>'error_code' end)
      and (not (p_filters ? 'http_status') or case when p_filters->>'http_op' = 'is_not' then gr.status_code is distinct from (p_filters->>'http_status')::integer else gr.status_code = (p_filters->>'http_status')::integer end)
      and (not (p_filters ? 'source') or case when p_filters->>'source_op' = 'is_not' then gr.client_source_id is distinct from p_filters->>'source' else gr.client_source_id = p_filters->>'source' end)
      and (not (p_filters ? 'stream') or case when p_filters->>'stream_op' = 'is_not' then gr.stream is distinct from ((p_filters->>'stream') = 'streaming') else gr.stream = ((p_filters->>'stream') = 'streaming') end)
      and (not (p_filters ? 'status') or case when p_filters->>'status_op' = 'is_not' then gr.success is distinct from ((p_filters->>'status') = 'success') else gr.success = ((p_filters->>'status') = 'success') end)
      and (not (p_filters ? 'input_tokens') or case p_filters->>'input_tokens_op' when 'eq' then gr.usage_input_tokens = (p_filters->>'input_tokens')::bigint when 'lte' then gr.usage_input_tokens <= (p_filters->>'input_tokens')::bigint when 'between' then gr.usage_input_tokens between (p_filters->>'input_tokens')::bigint and (p_filters->>'input_tokens_max')::bigint else gr.usage_input_tokens >= (p_filters->>'input_tokens')::bigint end)
      and (not (p_filters ? 'output_tokens') or case p_filters->>'output_tokens_op' when 'eq' then gr.usage_output_tokens = (p_filters->>'output_tokens')::bigint when 'lte' then gr.usage_output_tokens <= (p_filters->>'output_tokens')::bigint when 'between' then gr.usage_output_tokens between (p_filters->>'output_tokens')::bigint and (p_filters->>'output_tokens_max')::bigint else gr.usage_output_tokens >= (p_filters->>'output_tokens')::bigint end)
      and (not (p_filters ? 'total_tokens') or case p_filters->>'total_tokens_op' when 'eq' then gr.usage_total_tokens = (p_filters->>'total_tokens')::bigint when 'lte' then gr.usage_total_tokens <= (p_filters->>'total_tokens')::bigint when 'between' then gr.usage_total_tokens between (p_filters->>'total_tokens')::bigint and (p_filters->>'total_tokens_max')::bigint else gr.usage_total_tokens >= (p_filters->>'total_tokens')::bigint end)
  )
  select 'model', model_id, null::text, count(*) from scoped where model_id is not null group by model_id
  union all select 'provider', provider, null::text, count(*) from scoped where provider is not null group by provider
  union all select 'app', app_id, null::text, count(*) from scoped where app_id is not null group by app_id
  union all select 'key', key_id, null::text, count(*) from scoped where key_id is not null group by key_id
  union all select 'endpoint', endpoint, null::text, count(*) from scoped where endpoint is not null group by endpoint
  union all select 'stream', stream_mode, null::text, count(*) from scoped group by stream_mode
  union all select 'finish_reason', finish_reason, null::text, count(*) from scoped where finish_reason is not null group by finish_reason
  union all select 'error_code', error_code, null::text, count(*) from scoped where error_code is not null group by error_code
  union all select 'http_status', status_code, null::text, count(*) from scoped where status_code is not null group by status_code
  union all select 'status', request_status, null::text, count(*) from scoped group by request_status
  union all select 'source', client_source_id, max(client_source_name), count(*) from scoped where client_source_id is not null group by client_source_id;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_gateway_request_facets"(uuid, timestamp WITH time zone, timestamp WITH time zone) TO "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_gateway_request_facets"(uuid, timestamp WITH time zone, timestamp WITH time zone) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."get_gateway_request_facets"(uuid, timestamp WITH time zone, timestamp WITH time zone, jsonb) TO "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_gateway_request_facets"(uuid, timestamp WITH time zone, timestamp WITH time zone, jsonb) TO "service_role";

COMMENT ON FUNCTION "public"."get_gateway_request_facets"(uuid, timestamp with time zone, timestamp with time zone) IS 'Workspace/time-scoped exact request filter counts. Uses caller RLS and returns no raw request payloads.';

COMMENT ON FUNCTION "public"."get_gateway_request_facets"(uuid, timestamp with time zone, timestamp with time zone, jsonb) IS 'Exact workspace/time request-log facet counts after applying the current categorical and token filters.';

REVOKE ALL ON FUNCTION "public"."get_gateway_request_facets"(uuid, timestamp WITH time zone, timestamp WITH time zone) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."get_gateway_request_facets"(uuid, timestamp WITH time zone, timestamp WITH time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_gateway_request_facets"(uuid, timestamp WITH time zone, timestamp WITH time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_gateway_request_facets"(uuid, timestamp WITH time zone, timestamp WITH time zone, jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."get_gateway_request_facets"(uuid, timestamp WITH time zone, timestamp WITH time zone, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_gateway_request_facets"(uuid, timestamp WITH time zone, timestamp WITH time zone, jsonb) TO "postgres";
