-- Public model/provider health and completion-shape metrics for model pages.
--
-- This keeps the public API layer off raw gateway_requests pagination while
-- preserving provider-by-provider latency, throughput, uptime, rate-limit, and
-- successful finish reason distributions.

create index if not exists gateway_requests_canonical_provider_created_idx
  on public.gateway_requests (canonical_model_id, provider, created_at desc)
  where canonical_model_id is not null and provider is not null;

create index if not exists gateway_requests_requested_provider_created_idx
  on public.gateway_requests (requested_model_id, provider, created_at desc)
  where requested_model_id is not null and provider is not null;

create index if not exists gateway_requests_routed_provider_created_idx
  on public.gateway_requests (routed_model_id, provider, created_at desc)
  where routed_model_id is not null and provider is not null;

create index if not exists gateway_requests_finish_reason_created_idx
  on public.gateway_requests (finish_reason, created_at desc)
  where finish_reason is not null;

create or replace function public.gateway_usage_numeric_field(
  p_usage jsonb,
  variadic p_keys text[]
)
returns numeric
language plpgsql
immutable
as $$
declare
  v_key text;
  v_value text;
begin
  if p_usage is null then
    return null;
  end if;

  foreach v_key in array p_keys loop
    if p_usage ? v_key then
      v_value := p_usage ->> v_key;
      if v_value ~ '^-?[0-9]+(\.[0-9]+)?$' then
        return v_value::numeric;
      end if;
    end if;
  end loop;

  return null;
end;
$$;

comment on function public.gateway_usage_numeric_field(jsonb, text[]) is
  'Safely reads the first numeric usage value matching the supplied key priority list.';

create or replace function public.get_model_provider_health_metrics(
  p_model_ids text[],
  p_provider_ids text[] default null,
  p_window_days integer default 30,
  p_bucket_hours integer default 24
)
returns table (
  provider_id text,
  provider_name text,
  requests bigint,
  requests_30m bigint,
  success_requests bigint,
  failed_requests bigint,
  neutral_requests bigint,
  rate_limited_requests bigint,
  health_requests bigint,
  health_success_requests bigint,
  uptime_pct numeric,
  request_success_pct numeric,
  avg_latency_ms_30m numeric,
  avg_throughput_30m numeric,
  avg_latency_ms numeric,
  p50_latency_ms numeric,
  p95_latency_ms numeric,
  avg_generation_ms numeric,
  avg_throughput numeric,
  total_tokens bigint,
  input_tokens_1h bigint,
  output_tokens_1h bigint,
  cached_read_tokens_1h bigint,
  input_tokens bigint,
  output_tokens bigint,
  finish_reason_counts jsonb,
  error_code_counts jsonb,
  buckets jsonb,
  last_request_at timestamptz
)
language sql
stable
as $$
  with params as (
    select
      greatest(1, least(coalesce(p_window_days, 30), 90))::integer as window_days,
      greatest(1, least(coalesce(p_bucket_hours, 24), 24 * 7))::integer as bucket_hours,
      now() as now_ts
  ),
  provider_filter as (
    select distinct nullif(btrim(input.provider_id), '') as provider_id
    from unnest(coalesce(p_provider_ids, array[]::text[])) as input(provider_id)
    where nullif(btrim(input.provider_id), '') is not null
  ),
  model_filter as (
    select distinct nullif(btrim(input.model_id), '') as model_id
    from unnest(coalesce(p_model_ids, array[]::text[])) as input(model_id)
    where nullif(btrim(input.model_id), '') is not null
  ),
  base as (
    select
      coalesce(nullif(gr.provider, ''), 'unknown') as provider_id,
      gr.created_at,
      gr.success,
      gr.status_code,
      lower(coalesce(gr.error_code, '')) as error_code,
      lower(nullif(btrim(coalesce(gr.finish_reason, '')), '')) as finish_reason,
      gr.latency_ms,
      gr.generation_ms,
      gr.throughput,
      public.gateway_usage_total_tokens(gr.usage)::bigint as total_tokens,
      coalesce(
        public.gateway_usage_numeric_field(
          gr.usage,
          'input_tokens',
          'prompt_tokens',
          'inputTokens',
          'promptTokens',
          'total_input_tokens',
          'totalInputTokens'
        ),
        0
      )::bigint as input_tokens,
      coalesce(
        public.gateway_usage_numeric_field(
          gr.usage,
          'output_tokens',
          'completion_tokens',
          'generated_tokens',
          'response_tokens',
          'outputTokens',
          'completionTokens',
          'total_output_tokens',
          'totalOutputTokens'
        ),
        0
      )::bigint as output_tokens
      ,
      coalesce(
        public.gateway_usage_numeric_field(
          gr.usage,
          'cached_read_text_tokens',
          'cached_read_image_tokens',
          'cached_read_audio_tokens',
          'cached_read_video_tokens',
          'cached_read_tokens',
          'cache_read_input_tokens'
        ),
        0
      )::bigint as cached_read_tokens
    from public.gateway_requests gr
    join params p on true
    where gr.created_at >= p.now_ts - make_interval(days => p.window_days)
      and exists (
        select 1
        from model_filter mf
        where mf.model_id in (
          nullif(gr.model_id, ''),
          nullif(gr.canonical_model_id, ''),
          nullif(gr.requested_model_id, ''),
          nullif(gr.routed_model_id, ''),
          public.resolve_public_model_id(gr.model_id, gr.provider)
        )
      )
      and gr.provider is not null
      and gr.provider <> ''
      and (
        p_provider_ids is null
        or exists (
          select 1
          from provider_filter pf
          where pf.provider_id = gr.provider
        )
      )
  ),
  classified as (
    select
      b.*,
      case
        when b.success is true then 'success'
        when b.status_code = 429
          or b.error_code like '%rate limit%'
          or b.error_code like '%rate_limit%'
          or b.error_code like '%ratelimit%'
          or b.error_code like '%too many requests%'
          or b.error_code like '%quota exceeded%'
        then 'neutral'
        when b.error_code like '%abort%'
          or b.error_code like '%cancel%'
          or b.error_code like '%client_closed%'
        then 'neutral'
        else 'failure'
      end as health_outcome,
      case
        when b.status_code = 429
          or b.error_code like '%rate limit%'
          or b.error_code like '%rate_limit%'
          or b.error_code like '%ratelimit%'
          or b.error_code like '%too many requests%'
          or b.error_code like '%quota exceeded%'
        then true
        else false
      end as is_rate_limited
    from base b
  ),
  aggregates as (
    select
      c.provider_id,
      count(*)::bigint as requests,
      count(*) filter (where c.created_at >= (select now_ts from params) - interval '30 minutes')::bigint as requests_30m,
      count(*) filter (where c.success is true)::bigint as success_requests,
      count(*) filter (where c.health_outcome = 'failure')::bigint as failed_requests,
      count(*) filter (where c.health_outcome = 'neutral')::bigint as neutral_requests,
      count(*) filter (where c.is_rate_limited)::bigint as rate_limited_requests,
      count(*) filter (where c.health_outcome <> 'neutral')::bigint as health_requests,
      count(*) filter (where c.health_outcome = 'success')::bigint as health_success_requests,
      avg(c.latency_ms) filter (
        where c.success is true
          and c.latency_ms is not null
          and c.created_at >= (select now_ts from params) - interval '30 minutes'
      )::numeric as avg_latency_ms_30m,
      avg(c.throughput) filter (
        where c.success is true
          and c.throughput is not null
          and c.created_at >= (select now_ts from params) - interval '30 minutes'
      )::numeric as avg_throughput_30m,
      avg(c.latency_ms) filter (where c.success is true and c.latency_ms is not null)::numeric as avg_latency_ms,
      percentile_cont(0.5) within group (order by c.latency_ms)
        filter (where c.success is true and c.latency_ms is not null)::numeric as p50_latency_ms,
      percentile_cont(0.95) within group (order by c.latency_ms)
        filter (where c.success is true and c.latency_ms is not null)::numeric as p95_latency_ms,
      avg(c.generation_ms) filter (where c.success is true and c.generation_ms is not null)::numeric as avg_generation_ms,
      avg(c.throughput) filter (where c.success is true and c.throughput is not null)::numeric as avg_throughput,
      coalesce(sum(c.total_tokens), 0)::bigint as total_tokens,
      coalesce(sum(c.input_tokens) filter (where c.created_at >= (select now_ts from params) - interval '1 hour'), 0)::bigint as input_tokens_1h,
      coalesce(sum(c.output_tokens) filter (where c.created_at >= (select now_ts from params) - interval '1 hour'), 0)::bigint as output_tokens_1h,
      coalesce(sum(c.cached_read_tokens) filter (where c.created_at >= (select now_ts from params) - interval '1 hour'), 0)::bigint as cached_read_tokens_1h,
      coalesce(sum(c.input_tokens), 0)::bigint as input_tokens,
      coalesce(sum(c.output_tokens), 0)::bigint as output_tokens,
      max(c.created_at) as last_request_at
    from classified c
    group by c.provider_id
  ),
  finish_reasons as (
    select
      x.provider_id,
      jsonb_object_agg(x.finish_reason, x.reason_count order by x.reason_count desc, x.finish_reason) as finish_reason_counts
    from (
      select
        c.provider_id,
        c.finish_reason,
        count(*)::bigint as reason_count
      from classified c
      where c.success is true
        and c.finish_reason is not null
        and c.finish_reason <> ''
        and c.finish_reason <> 'error'
      group by c.provider_id, c.finish_reason
    ) x
    group by x.provider_id
  ),
  error_codes as (
    select
      x.provider_id,
      jsonb_object_agg(x.error_code, x.error_count order by x.error_count desc, x.error_code) as error_code_counts
    from (
      select
        c.provider_id,
        coalesce(nullif(c.error_code, ''), 'unknown') as error_code,
        count(*)::bigint as error_count
      from classified c
      where c.health_outcome = 'failure'
      group by c.provider_id, coalesce(nullif(c.error_code, ''), 'unknown')
    ) x
    group by x.provider_id
  ),
  bucketed as (
    select
      b.provider_id,
      jsonb_agg(
        jsonb_build_object(
          'start', b.bucket_start,
          'end', b.bucket_start + make_interval(hours => (select bucket_hours from params)),
          'requests', b.requests,
          'success_requests', b.success_requests,
          'health_requests', b.health_requests,
          'health_success_requests', b.health_success_requests,
          'uptime_pct',
            case
              when b.health_requests > 0
              then round((b.health_success_requests::numeric / b.health_requests::numeric) * 100, 2)
              else null
            end,
          'request_success_pct',
            case
              when b.requests > 0
              then round((b.success_requests::numeric / b.requests::numeric) * 100, 2)
              else null
            end,
          'avg_latency_ms', b.avg_latency_ms,
          'avg_throughput', b.avg_throughput
        )
        order by b.bucket_start
      ) as buckets
    from (
      select
        c.provider_id,
        date_bin(
          make_interval(hours => p.bucket_hours),
          c.created_at,
          timestamp with time zone '2000-01-01 00:00:00+00'
        ) as bucket_start,
        count(*)::bigint as requests,
        count(*) filter (where c.success is true)::bigint as success_requests,
        count(*) filter (where c.health_outcome <> 'neutral')::bigint as health_requests,
        count(*) filter (where c.health_outcome = 'success')::bigint as health_success_requests,
        avg(c.latency_ms) filter (where c.success is true and c.latency_ms is not null)::numeric as avg_latency_ms,
        avg(c.throughput) filter (where c.success is true and c.throughput is not null)::numeric as avg_throughput
      from classified c
      join params p on true
      group by c.provider_id, bucket_start
    ) b
    group by b.provider_id
  )
  select
    coalesce(pf.provider_id, a.provider_id) as provider_id,
    coalesce(dap.api_provider_name, coalesce(pf.provider_id, a.provider_id)) as provider_name,
    coalesce(a.requests, 0)::bigint as requests,
    coalesce(a.requests_30m, 0)::bigint as requests_30m,
    coalesce(a.success_requests, 0)::bigint as success_requests,
    coalesce(a.failed_requests, 0)::bigint as failed_requests,
    coalesce(a.neutral_requests, 0)::bigint as neutral_requests,
    coalesce(a.rate_limited_requests, 0)::bigint as rate_limited_requests,
    coalesce(a.health_requests, 0)::bigint as health_requests,
    coalesce(a.health_success_requests, 0)::bigint as health_success_requests,
    case
      when coalesce(a.health_requests, 0) > 0
      then round((a.health_success_requests::numeric / a.health_requests::numeric) * 100, 2)
      else null
    end as uptime_pct,
    case
      when coalesce(a.requests, 0) > 0
      then round((a.success_requests::numeric / a.requests::numeric) * 100, 2)
      else null
    end as request_success_pct,
    round(a.avg_latency_ms_30m, 2) as avg_latency_ms_30m,
    round(a.avg_throughput_30m, 2) as avg_throughput_30m,
    round(a.avg_latency_ms, 2) as avg_latency_ms,
    round(a.p50_latency_ms, 2) as p50_latency_ms,
    round(a.p95_latency_ms, 2) as p95_latency_ms,
    round(a.avg_generation_ms, 2) as avg_generation_ms,
    round(a.avg_throughput, 2) as avg_throughput,
    coalesce(a.total_tokens, 0)::bigint as total_tokens,
    coalesce(a.input_tokens_1h, 0)::bigint as input_tokens_1h,
    coalesce(a.output_tokens_1h, 0)::bigint as output_tokens_1h,
    coalesce(a.cached_read_tokens_1h, 0)::bigint as cached_read_tokens_1h,
    coalesce(a.input_tokens, 0)::bigint as input_tokens,
    coalesce(a.output_tokens, 0)::bigint as output_tokens,
    coalesce(fr.finish_reason_counts, '{}'::jsonb) as finish_reason_counts,
    coalesce(ec.error_code_counts, '{}'::jsonb) as error_code_counts,
    coalesce(b.buckets, '[]'::jsonb) as buckets,
    a.last_request_at
  from aggregates a
  full join provider_filter pf on pf.provider_id = a.provider_id
  left join public.data_api_providers dap
    on dap.api_provider_id = coalesce(pf.provider_id, a.provider_id)
  left join finish_reasons fr
    on fr.provider_id = a.provider_id
  left join error_codes ec
    on ec.provider_id = a.provider_id
  left join bucketed b
    on b.provider_id = a.provider_id
  where p_provider_ids is null or pf.provider_id is not null
  order by coalesce(a.requests, 0) desc, coalesce(pf.provider_id, a.provider_id);
$$;

grant execute on function public.gateway_usage_numeric_field(jsonb, text[])
  to authenticated, service_role;

grant execute on function public.get_model_provider_health_metrics(text[], text[], integer, integer)
  to authenticated, service_role;

comment on function public.get_model_provider_health_metrics(text[], text[], integer, integer) is
  'Provider-by-provider public model health metrics including uptime, latency, throughput, tokens, successful finish reasons, and failure codes.';
