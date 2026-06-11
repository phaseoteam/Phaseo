-- Daily model/provider usage rollups with explicit modality counters.
--
-- Goal: make OpenRouter-style model usage graphs cheap:
-- - requests by day
-- - input/output/reasoning tokens by day
-- - image/audio/video input and output usage by day
-- - provider-by-provider slices without repeatedly scanning gateway_requests.usage JSON.

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
  v_part text;
  v_cursor jsonb;
  v_value text;
begin
  if p_usage is null then
    return null;
  end if;

  foreach v_key in array p_keys loop
    v_cursor := p_usage;

    foreach v_part in array string_to_array(v_key, '.') loop
      if v_cursor is null or jsonb_typeof(v_cursor) <> 'object' or not (v_cursor ? v_part) then
        v_cursor := null;
        exit;
      end if;
      v_cursor := v_cursor -> v_part;
    end loop;

    if v_cursor is null then
      continue;
    end if;

    v_value := trim(both '"' from v_cursor::text);
    if v_value ~ '^-?[0-9]+(\.[0-9]+)?$' then
      return v_value::numeric;
    end if;
  end loop;

  return null;
end;
$$;

comment on function public.gateway_usage_numeric_field(jsonb, text[]) is
  'Safely reads the first numeric usage value matching the supplied top-level or dotted JSON key priority list.';

create table if not exists public.gateway_model_usage_daily (
  day_bucket date not null,
  model_id text not null,
  provider_id text not null,
  endpoint text not null,

  requests bigint not null default 0,
  success_requests bigint not null default 0,
  failed_requests bigint not null default 0,
  neutral_requests bigint not null default 0,
  rate_limited_requests bigint not null default 0,

  total_tokens bigint not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  reasoning_tokens bigint not null default 0,

  input_text_tokens bigint not null default 0,
  output_text_tokens bigint not null default 0,
  input_image_tokens bigint not null default 0,
  output_image_tokens bigint not null default 0,
  input_audio_tokens bigint not null default 0,
  output_audio_tokens bigint not null default 0,
  input_video_tokens bigint not null default 0,
  output_video_tokens bigint not null default 0,

  image_inputs bigint not null default 0,
  image_outputs bigint not null default 0,
  audio_inputs bigint not null default 0,
  audio_outputs bigint not null default 0,
  video_inputs bigint not null default 0,
  video_outputs bigint not null default 0,

  cached_read_tokens bigint not null default 0,
  cached_write_tokens bigint not null default 0,
  cached_read_text_tokens bigint not null default 0,
  cached_write_text_tokens bigint not null default 0,
  cached_read_image_tokens bigint not null default 0,
  cached_write_image_tokens bigint not null default 0,
  cached_read_audio_tokens bigint not null default 0,
  cached_write_audio_tokens bigint not null default 0,
  cached_read_video_tokens bigint not null default 0,
  cached_write_video_tokens bigint not null default 0,

  total_cost_nanos bigint not null default 0,
  latency_sum_ms bigint not null default 0,
  latency_samples bigint not null default 0,
  generation_sum_ms bigint not null default 0,
  generation_samples bigint not null default 0,
  throughput_sum numeric not null default 0,
  throughput_samples bigint not null default 0,

  last_request_at timestamptz null,
  refreshed_at timestamptz not null default now(),

  constraint gateway_model_usage_daily_pkey
    primary key (day_bucket, model_id, provider_id, endpoint)
);

create index if not exists gateway_model_usage_daily_model_day_idx
  on public.gateway_model_usage_daily (model_id, day_bucket desc);

create index if not exists gateway_model_usage_daily_provider_day_idx
  on public.gateway_model_usage_daily (provider_id, day_bucket desc);

create index if not exists gateway_model_usage_daily_day_idx
  on public.gateway_model_usage_daily (day_bucket desc);

comment on table public.gateway_model_usage_daily is
  'Daily public gateway usage rollup by model/provider/endpoint with explicit token, media, cache, request, and performance counters.';

create or replace function public.gateway_request_usage_rollup_rows(
  p_since timestamptz,
  p_until timestamptz default now()
)
returns table (
  day_bucket date,
  model_id text,
  provider_id text,
  endpoint text,
  requests bigint,
  success_requests bigint,
  failed_requests bigint,
  neutral_requests bigint,
  rate_limited_requests bigint,
  total_tokens bigint,
  input_tokens bigint,
  output_tokens bigint,
  reasoning_tokens bigint,
  input_text_tokens bigint,
  output_text_tokens bigint,
  input_image_tokens bigint,
  output_image_tokens bigint,
  input_audio_tokens bigint,
  output_audio_tokens bigint,
  input_video_tokens bigint,
  output_video_tokens bigint,
  image_inputs bigint,
  image_outputs bigint,
  audio_inputs bigint,
  audio_outputs bigint,
  video_inputs bigint,
  video_outputs bigint,
  cached_read_tokens bigint,
  cached_write_tokens bigint,
  cached_read_text_tokens bigint,
  cached_write_text_tokens bigint,
  cached_read_image_tokens bigint,
  cached_write_image_tokens bigint,
  cached_read_audio_tokens bigint,
  cached_write_audio_tokens bigint,
  cached_read_video_tokens bigint,
  cached_write_video_tokens bigint,
  total_cost_nanos bigint,
  latency_sum_ms bigint,
  latency_samples bigint,
  generation_sum_ms bigint,
  generation_samples bigint,
  throughput_sum numeric,
  throughput_samples bigint,
  last_request_at timestamptz
)
language sql
stable
as $$
  with base as (
    select
      date_trunc('day', gr.created_at at time zone 'utc')::date as day_bucket,
      coalesce(
        nullif(gr.canonical_model_id, ''),
        public.resolve_public_model_id(gr.model_id, gr.provider),
        nullif(gr.routed_model_id, ''),
        nullif(gr.requested_model_id, ''),
        nullif(gr.model_id, ''),
        'unknown'
      ) as model_id,
      coalesce(nullif(gr.provider, ''), 'unknown') as provider_id,
      coalesce(nullif(gr.endpoint, ''), 'unknown') as endpoint,
      gr.created_at,
      gr.success,
      gr.status_code,
      lower(coalesce(gr.error_code, '')) as error_code,
      gr.usage,
      gr.cost_nanos,
      gr.latency_ms,
      gr.generation_ms,
      gr.throughput
    from public.gateway_requests gr
    where gr.created_at >= p_since
      and gr.created_at < p_until
  ),
  normalized as (
    select
      b.*,
      coalesce(public.gateway_usage_total_tokens(b.usage), 0)::bigint as total_tokens,
      coalesce(public.gateway_usage_numeric_field(
        b.usage,
        'input_tokens',
        'prompt_tokens',
        'inputTokens',
        'promptTokens',
        'promptTokenCount',
        'total_input_tokens',
        'totalInputTokens'
      ), 0)::bigint as input_tokens,
      coalesce(public.gateway_usage_numeric_field(
        b.usage,
        'output_tokens',
        'completion_tokens',
        'outputTokens',
        'completionTokens',
        'candidatesTokenCount',
        'total_output_tokens',
        'totalOutputTokens'
      ), 0)::bigint as output_tokens,
      coalesce(public.gateway_usage_numeric_field(
        b.usage,
        'reasoning_tokens',
        'reasoning_output_tokens',
        'output_reasoning_tokens',
        'completion_tokens_details.reasoning_tokens',
        'output_tokens_details.reasoning_tokens'
      ), 0)::bigint as reasoning_tokens,
      coalesce(public.gateway_usage_numeric_field(
        b.usage,
        'input_image_tokens',
        'image_input_tokens',
        'prompt_image_tokens',
        'input_tokens_details.image_tokens',
        'prompt_tokens_details.image_tokens'
      ), 0)::bigint as input_image_tokens,
      coalesce(public.gateway_usage_numeric_field(
        b.usage,
        'output_image_tokens',
        'image_output_tokens',
        'generated_image_tokens',
        'completion_tokens_details.image_tokens',
        'output_tokens_details.image_tokens'
      ), 0)::bigint as output_image_tokens,
      coalesce(public.gateway_usage_numeric_field(
        b.usage,
        'input_audio_tokens',
        'audio_input_tokens',
        'prompt_audio_tokens',
        'input_tokens_details.audio_tokens',
        'prompt_tokens_details.audio_tokens'
      ), 0)::bigint as input_audio_tokens,
      coalesce(public.gateway_usage_numeric_field(
        b.usage,
        'output_audio_tokens',
        'audio_output_tokens',
        'completion_tokens_details.audio_tokens',
        'output_tokens_details.audio_tokens'
      ), 0)::bigint as output_audio_tokens,
      coalesce(public.gateway_usage_numeric_field(
        b.usage,
        'input_video_tokens',
        'video_input_tokens',
        'input_tokens_details.video_tokens',
        'prompt_tokens_details.video_tokens'
      ), 0)::bigint as input_video_tokens,
      coalesce(public.gateway_usage_numeric_field(
        b.usage,
        'output_video_tokens',
        'video_output_tokens',
        'completion_tokens_details.video_tokens',
        'output_tokens_details.video_tokens'
      ), 0)::bigint as output_video_tokens,
      coalesce(public.gateway_usage_numeric_field(
        b.usage,
        'input_image_count',
        'image_input_count',
        'image_inputs',
        'input_images'
      ), 0)::bigint as image_inputs,
      coalesce(public.gateway_usage_numeric_field(
        b.usage,
        'output_image_count',
        'image_output_count',
        'image_outputs',
        'output_images',
        'generated_images',
        'image_count'
      ), 0)::bigint as image_outputs,
      coalesce(public.gateway_usage_numeric_field(
        b.usage,
        'input_audio_count',
        'audio_input_count',
        'audio_inputs',
        'input_audio'
      ), 0)::bigint as audio_inputs,
      coalesce(public.gateway_usage_numeric_field(
        b.usage,
        'output_audio_count',
        'audio_output_count',
        'audio_outputs',
        'output_audio'
      ), 0)::bigint as audio_outputs,
      coalesce(public.gateway_usage_numeric_field(
        b.usage,
        'input_video_count',
        'video_input_count',
        'video_inputs',
        'input_videos'
      ), 0)::bigint as video_inputs,
      coalesce(public.gateway_usage_numeric_field(
        b.usage,
        'output_video_count',
        'video_output_count',
        'video_outputs',
        'output_videos',
        'video_count'
      ), 0)::bigint as video_outputs,
      coalesce(public.gateway_usage_numeric_field(
        b.usage,
        'cached_read_tokens',
        'cache_read_input_tokens',
        'input_tokens_details.cached_tokens',
        'prompt_tokens_details.cached_tokens'
      ), 0)::bigint as cached_read_tokens,
      coalesce(public.gateway_usage_numeric_field(
        b.usage,
        'cached_write_tokens',
        'cache_creation_input_tokens',
        'output_tokens_details.cached_tokens'
      ), 0)::bigint as cached_write_tokens,
      coalesce(public.gateway_usage_numeric_field(b.usage, 'cached_read_text_tokens'), 0)::bigint as cached_read_text_tokens,
      coalesce(public.gateway_usage_numeric_field(b.usage, 'cached_write_text_tokens'), 0)::bigint as cached_write_text_tokens,
      coalesce(public.gateway_usage_numeric_field(b.usage, 'cached_read_image_tokens'), 0)::bigint as cached_read_image_tokens,
      coalesce(public.gateway_usage_numeric_field(b.usage, 'cached_write_image_tokens'), 0)::bigint as cached_write_image_tokens,
      coalesce(public.gateway_usage_numeric_field(b.usage, 'cached_read_audio_tokens'), 0)::bigint as cached_read_audio_tokens,
      coalesce(public.gateway_usage_numeric_field(b.usage, 'cached_write_audio_tokens'), 0)::bigint as cached_write_audio_tokens,
      coalesce(public.gateway_usage_numeric_field(b.usage, 'cached_read_video_tokens'), 0)::bigint as cached_read_video_tokens,
      coalesce(public.gateway_usage_numeric_field(b.usage, 'cached_write_video_tokens'), 0)::bigint as cached_write_video_tokens
    from base b
  ),
  enriched as (
    select
      n.*,
      greatest(n.input_tokens - n.input_image_tokens - n.input_audio_tokens - n.input_video_tokens, 0)::bigint as inferred_input_text_tokens,
      greatest(n.output_tokens - n.output_image_tokens - n.output_audio_tokens - n.output_video_tokens - n.reasoning_tokens, 0)::bigint as inferred_output_text_tokens,
      case
        when n.success is true then 'success'
        when n.status_code = 429
          or n.error_code like '%rate limit%'
          or n.error_code like '%rate_limit%'
          or n.error_code like '%ratelimit%'
          or n.error_code like '%too many requests%'
          or n.error_code like '%quota exceeded%'
          or n.error_code like '%abort%'
          or n.error_code like '%cancel%'
          or n.error_code like '%client_closed%'
        then 'neutral'
        else 'failure'
      end as health_outcome,
      case
        when n.status_code = 429
          or n.error_code like '%rate limit%'
          or n.error_code like '%rate_limit%'
          or n.error_code like '%ratelimit%'
          or n.error_code like '%too many requests%'
          or n.error_code like '%quota exceeded%'
        then true
        else false
      end as is_rate_limited
    from normalized n
  )
  select
    e.day_bucket,
    e.model_id,
    e.provider_id,
    e.endpoint,
    count(*)::bigint as requests,
    count(*) filter (where e.success is true)::bigint as success_requests,
    count(*) filter (where e.health_outcome = 'failure')::bigint as failed_requests,
    count(*) filter (where e.health_outcome = 'neutral')::bigint as neutral_requests,
    count(*) filter (where e.is_rate_limited)::bigint as rate_limited_requests,
    sum(e.total_tokens)::bigint as total_tokens,
    sum(e.input_tokens)::bigint as input_tokens,
    sum(e.output_tokens)::bigint as output_tokens,
    sum(e.reasoning_tokens)::bigint as reasoning_tokens,
    sum(coalesce(public.gateway_usage_numeric_field(e.usage, 'input_text_tokens', 'text_input_tokens'), e.inferred_input_text_tokens))::bigint as input_text_tokens,
    sum(coalesce(public.gateway_usage_numeric_field(e.usage, 'output_text_tokens', 'text_output_tokens'), e.inferred_output_text_tokens))::bigint as output_text_tokens,
    sum(e.input_image_tokens)::bigint as input_image_tokens,
    sum(e.output_image_tokens)::bigint as output_image_tokens,
    sum(e.input_audio_tokens)::bigint as input_audio_tokens,
    sum(e.output_audio_tokens)::bigint as output_audio_tokens,
    sum(e.input_video_tokens)::bigint as input_video_tokens,
    sum(e.output_video_tokens)::bigint as output_video_tokens,
    sum(e.image_inputs)::bigint as image_inputs,
    sum(e.image_outputs)::bigint as image_outputs,
    sum(e.audio_inputs)::bigint as audio_inputs,
    sum(e.audio_outputs)::bigint as audio_outputs,
    sum(e.video_inputs)::bigint as video_inputs,
    sum(e.video_outputs)::bigint as video_outputs,
    sum(e.cached_read_tokens)::bigint as cached_read_tokens,
    sum(e.cached_write_tokens)::bigint as cached_write_tokens,
    sum(e.cached_read_text_tokens)::bigint as cached_read_text_tokens,
    sum(e.cached_write_text_tokens)::bigint as cached_write_text_tokens,
    sum(e.cached_read_image_tokens)::bigint as cached_read_image_tokens,
    sum(e.cached_write_image_tokens)::bigint as cached_write_image_tokens,
    sum(e.cached_read_audio_tokens)::bigint as cached_read_audio_tokens,
    sum(e.cached_write_audio_tokens)::bigint as cached_write_audio_tokens,
    sum(e.cached_read_video_tokens)::bigint as cached_read_video_tokens,
    sum(e.cached_write_video_tokens)::bigint as cached_write_video_tokens,
    sum(coalesce(e.cost_nanos, 0))::bigint as total_cost_nanos,
    sum(coalesce(e.latency_ms, 0)) filter (where e.latency_ms is not null)::bigint as latency_sum_ms,
    count(e.latency_ms)::bigint as latency_samples,
    sum(coalesce(e.generation_ms, 0)) filter (where e.generation_ms is not null)::bigint as generation_sum_ms,
    count(e.generation_ms)::bigint as generation_samples,
    sum(coalesce(e.throughput, 0)) filter (where e.throughput is not null)::numeric as throughput_sum,
    count(e.throughput)::bigint as throughput_samples,
    max(e.created_at) as last_request_at
  from enriched e
  where e.model_id is not null
    and e.model_id <> ''
  group by e.day_bucket, e.model_id, e.provider_id, e.endpoint;
$$;

create or replace function public.refresh_gateway_model_usage_daily(
  p_since timestamptz default now() - interval '90 days',
  p_until timestamptz default now()
)
returns void
language plpgsql
as $$
declare
  v_since_date date := date_trunc('day', p_since at time zone 'utc')::date;
  v_until_date date := date_trunc('day', p_until at time zone 'utc')::date;
begin
  delete from public.gateway_model_usage_daily d
  where d.day_bucket >= v_since_date
    and d.day_bucket <= v_until_date;

  insert into public.gateway_model_usage_daily (
    day_bucket,
    model_id,
    provider_id,
    endpoint,
    requests,
    success_requests,
    failed_requests,
    neutral_requests,
    rate_limited_requests,
    total_tokens,
    input_tokens,
    output_tokens,
    reasoning_tokens,
    input_text_tokens,
    output_text_tokens,
    input_image_tokens,
    output_image_tokens,
    input_audio_tokens,
    output_audio_tokens,
    input_video_tokens,
    output_video_tokens,
    image_inputs,
    image_outputs,
    audio_inputs,
    audio_outputs,
    video_inputs,
    video_outputs,
    cached_read_tokens,
    cached_write_tokens,
    cached_read_text_tokens,
    cached_write_text_tokens,
    cached_read_image_tokens,
    cached_write_image_tokens,
    cached_read_audio_tokens,
    cached_write_audio_tokens,
    cached_read_video_tokens,
    cached_write_video_tokens,
    total_cost_nanos,
    latency_sum_ms,
    latency_samples,
    generation_sum_ms,
    generation_samples,
    throughput_sum,
    throughput_samples,
    last_request_at,
    refreshed_at
  )
  select
    r.day_bucket,
    r.model_id,
    r.provider_id,
    r.endpoint,
    r.requests,
    r.success_requests,
    r.failed_requests,
    r.neutral_requests,
    r.rate_limited_requests,
    r.total_tokens,
    r.input_tokens,
    r.output_tokens,
    r.reasoning_tokens,
    r.input_text_tokens,
    r.output_text_tokens,
    r.input_image_tokens,
    r.output_image_tokens,
    r.input_audio_tokens,
    r.output_audio_tokens,
    r.input_video_tokens,
    r.output_video_tokens,
    r.image_inputs,
    r.image_outputs,
    r.audio_inputs,
    r.audio_outputs,
    r.video_inputs,
    r.video_outputs,
    r.cached_read_tokens,
    r.cached_write_tokens,
    r.cached_read_text_tokens,
    r.cached_write_text_tokens,
    r.cached_read_image_tokens,
    r.cached_write_image_tokens,
    r.cached_read_audio_tokens,
    r.cached_write_audio_tokens,
    r.cached_read_video_tokens,
    r.cached_write_video_tokens,
    r.total_cost_nanos,
    r.latency_sum_ms,
    r.latency_samples,
    r.generation_sum_ms,
    r.generation_samples,
    r.throughput_sum,
    r.throughput_samples,
    r.last_request_at,
    now()
  from public.gateway_request_usage_rollup_rows(p_since, p_until) r;
end;
$$;

create or replace function public.get_model_usage_daily_breakdown(
  p_model_ids text[],
  p_provider_ids text[] default null,
  p_since date default (current_date - 30),
  p_until date default current_date
)
returns table (
  day_bucket date,
  model_id text,
  provider_id text,
  endpoint text,
  requests bigint,
  success_requests bigint,
  failed_requests bigint,
  neutral_requests bigint,
  rate_limited_requests bigint,
  total_tokens bigint,
  input_tokens bigint,
  output_tokens bigint,
  reasoning_tokens bigint,
  input_text_tokens bigint,
  output_text_tokens bigint,
  input_image_tokens bigint,
  output_image_tokens bigint,
  input_audio_tokens bigint,
  output_audio_tokens bigint,
  input_video_tokens bigint,
  output_video_tokens bigint,
  image_inputs bigint,
  image_outputs bigint,
  audio_inputs bigint,
  audio_outputs bigint,
  video_inputs bigint,
  video_outputs bigint,
  cached_read_tokens bigint,
  cached_write_tokens bigint,
  total_cost_nanos bigint,
  avg_latency_ms numeric,
  avg_generation_ms numeric,
  avg_throughput numeric
)
language sql
stable
as $$
  with model_filter as (
    select distinct nullif(btrim(input.model_id), '') as model_id
    from unnest(coalesce(p_model_ids, array[]::text[])) as input(model_id)
    where nullif(btrim(input.model_id), '') is not null
  ),
  provider_filter as (
    select distinct nullif(btrim(input.provider_id), '') as provider_id
    from unnest(coalesce(p_provider_ids, array[]::text[])) as input(provider_id)
    where nullif(btrim(input.provider_id), '') is not null
  )
  select
    d.day_bucket,
    d.model_id,
    d.provider_id,
    d.endpoint,
    d.requests,
    d.success_requests,
    d.failed_requests,
    d.neutral_requests,
    d.rate_limited_requests,
    d.total_tokens,
    d.input_tokens,
    d.output_tokens,
    d.reasoning_tokens,
    d.input_text_tokens,
    d.output_text_tokens,
    d.input_image_tokens,
    d.output_image_tokens,
    d.input_audio_tokens,
    d.output_audio_tokens,
    d.input_video_tokens,
    d.output_video_tokens,
    d.image_inputs,
    d.image_outputs,
    d.audio_inputs,
    d.audio_outputs,
    d.video_inputs,
    d.video_outputs,
    d.cached_read_tokens,
    d.cached_write_tokens,
    d.total_cost_nanos,
    case when d.latency_samples > 0 then round(d.latency_sum_ms::numeric / d.latency_samples::numeric, 2) else null end as avg_latency_ms,
    case when d.generation_samples > 0 then round(d.generation_sum_ms::numeric / d.generation_samples::numeric, 2) else null end as avg_generation_ms,
    case when d.throughput_samples > 0 then round(d.throughput_sum::numeric / d.throughput_samples::numeric, 2) else null end as avg_throughput
  from public.gateway_model_usage_daily d
  where d.day_bucket >= p_since
    and d.day_bucket <= p_until
    and exists (
      select 1 from model_filter mf where mf.model_id = d.model_id
    )
    and (
      p_provider_ids is null
      or exists (
        select 1 from provider_filter pf where pf.provider_id = d.provider_id
      )
    )
  order by d.day_bucket asc, d.requests desc, d.provider_id asc, d.endpoint asc;
$$;

grant execute on function public.gateway_request_usage_rollup_rows(timestamptz, timestamptz)
  to service_role;
grant execute on function public.refresh_gateway_model_usage_daily(timestamptz, timestamptz)
  to service_role;
grant execute on function public.get_model_usage_daily_breakdown(text[], text[], date, date)
  to authenticated, service_role;

comment on function public.refresh_gateway_model_usage_daily(timestamptz, timestamptz) is
  'Refreshes daily model/provider/endpoint usage rollups from gateway_requests for the supplied UTC window.';

comment on function public.get_model_usage_daily_breakdown(text[], text[], date, date) is
  'Returns daily model/provider/endpoint usage breakdowns with explicit token, media, cache, request, and performance counters.';
