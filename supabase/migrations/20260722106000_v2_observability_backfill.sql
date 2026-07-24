-- v2 observability backfill from the existing narrow gateway request facts.
-- No request/response bodies are copied.

insert into public.v2_request_facts (
  workspace_id, request_id, occurred_at, app_id, key_id, endpoint,
  requested_model_input, requested_model_slug, routed_model_slug,
  provider_model_id, status_code, success, error_code, tool_call_count,
  stream, byok, latency_ms, generation_ms, upstream_attempt_count,
  throughput, safe_metadata
)
select
  gr.workspace_id,
  gr.request_id,
  gr.created_at,
  gr.app_id,
  gr.key_id,
  gr.endpoint,
  coalesce(nullif(trim(gr.model_id), ''), 'unknown'),
  model.model_slug,
  model.model_slug,
  route.provider_model_id,
  gr.status_code,
  gr.success,
  gr.error_code,
  case
    when coalesce(gr.usage->>'tool_call_count', gr.usage->>'request_tool_count') ~ '^[0-9]+$'
      then coalesce(gr.usage->>'tool_call_count', gr.usage->>'request_tool_count')::integer
    else 0
  end,
  coalesce(gr.stream, false),
  coalesce(gr.byok, false),
  gr.latency_ms,
  gr.generation_ms,
  case when gr.provider is null then 0 else 1 end,
  gr.throughput,
  jsonb_build_object('legacy_gateway_request_id', gr.id, 'legacy_provider', gr.provider)
from public.gateway_requests gr
left join public.v2_models model
  on model.model_slug = lower(nullif(trim(gr.model_id), ''))
left join lateral (
  select provider_model_id
  from public.v2_model_provider_routes candidate
  where candidate.provider_slug = lower(nullif(trim(gr.provider), ''))
    and candidate.model_slug = model.model_slug
  order by candidate.routing_enabled desc, candidate.effective_from desc nulls last, candidate.provider_model_id
  limit 1
) route on true
on conflict (workspace_id, request_id) do update set
  occurred_at = excluded.occurred_at,
  requested_model_input = excluded.requested_model_input,
  requested_model_slug = excluded.requested_model_slug,
  routed_model_slug = excluded.routed_model_slug,
  provider_model_id = excluded.provider_model_id,
  status_code = excluded.status_code,
  success = excluded.success,
  error_code = excluded.error_code,
  tool_call_count = excluded.tool_call_count,
  latency_ms = excluded.latency_ms,
  generation_ms = excluded.generation_ms,
  upstream_attempt_count = excluded.upstream_attempt_count,
  throughput = excluded.throughput,
  safe_metadata = public.v2_request_facts.safe_metadata || excluded.safe_metadata;

insert into public.v2_request_usage (
  request_event_id, meter_key, modality, unit, quantity, source, billable
)
select
  fact.request_event_id,
  meter.meter_key,
  'text',
  'token',
  meter.quantity,
  'legacy_gateway_usage',
  true
from public.gateway_requests gr
join public.v2_request_facts fact
  on fact.workspace_id = gr.workspace_id and fact.request_id = gr.request_id
cross join lateral (
  values
    ('input_tokens', case when gr.usage->>'input_tokens' ~ '^[0-9]+(\.[0-9]+)?$' then (gr.usage->>'input_tokens')::numeric else 0 end),
    ('cached_input_tokens', case when gr.usage->'input_tokens_details'->>'cached_tokens' ~ '^[0-9]+(\.[0-9]+)?$' then (gr.usage->'input_tokens_details'->>'cached_tokens')::numeric else 0 end),
    ('output_tokens', case when gr.usage->>'output_tokens' ~ '^[0-9]+(\.[0-9]+)?$' then (gr.usage->>'output_tokens')::numeric else 0 end),
    ('reasoning_tokens', case when gr.usage->'output_tokens_details'->>'reasoning_tokens' ~ '^[0-9]+(\.[0-9]+)?$' then (gr.usage->'output_tokens_details'->>'reasoning_tokens')::numeric else 0 end)
) as meter(meter_key, quantity)
where meter.quantity > 0
on conflict (request_event_id, meter_key, sequence) do update set
  quantity = excluded.quantity;
