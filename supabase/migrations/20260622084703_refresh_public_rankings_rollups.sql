-- Keep public leaderboard reads on rollups rather than paging gateway_requests
-- from the web request path.

alter table public.gateway_model_usage_daily
  add column if not exists embedding_tokens bigint not null default 0,
  add column if not exists video_seconds numeric not null default 0;

create table if not exists public.public_app_model_usage_daily (
  day_bucket date not null,
  app_id text not null,
  model_id text not null,
  requests bigint not null default 0,
  tokens bigint not null default 0,
  refreshed_at timestamptz not null default now(),
  constraint public_app_model_usage_daily_pkey
    primary key (day_bucket, app_id, model_id)
);

create index if not exists public_app_model_usage_daily_app_day_idx
  on public.public_app_model_usage_daily (app_id, day_bucket desc);

create index if not exists public_app_model_usage_daily_day_idx
  on public.public_app_model_usage_daily (day_bucket desc);

comment on column public.gateway_model_usage_daily.embedding_tokens is
  'Native embedding endpoint token count rolled up from gateway_requests.usage_embedding_tokens.';

comment on column public.gateway_model_usage_daily.video_seconds is
  'Generated or processed video seconds rolled up from gateway_requests.usage_video_seconds.';

comment on table public.public_app_model_usage_daily is
  'Daily public app usage rollup by app and model for rankings pages.';

create or replace function public.refresh_public_leaderboard_rollups(
  p_since timestamptz default now() - interval '90 days',
  p_until timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
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
    cached_write_text_tokens_5m,
    cached_write_text_tokens_1h,
    cached_read_image_tokens,
    cached_write_image_tokens,
    cached_read_audio_tokens,
    cached_write_audio_tokens,
    cached_read_video_tokens,
    cached_write_video_tokens,
    input_quad_tokens,
    output_quad_tokens,
    total_quad_tokens,
    text_quad_tokens,
    rerank_quad_tokens,
    embedding_quad_tokens,
    moderation_quad_tokens,
    ocr_quad_tokens,
    image_megapixels,
    audio_seconds,
    video_pixel_seconds,
    input_characters,
    output_characters,
    total_characters,
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
    coalesce(r.requests, 0),
    coalesce(r.success_requests, 0),
    coalesce(r.failed_requests, 0),
    coalesce(r.neutral_requests, 0),
    coalesce(r.rate_limited_requests, 0),
    coalesce(r.total_tokens, 0),
    coalesce(r.input_tokens, 0),
    coalesce(r.output_tokens, 0),
    coalesce(r.reasoning_tokens, 0),
    coalesce(r.input_text_tokens, 0),
    coalesce(r.output_text_tokens, 0),
    coalesce(r.input_image_tokens, 0),
    coalesce(r.output_image_tokens, 0),
    coalesce(r.input_audio_tokens, 0),
    coalesce(r.output_audio_tokens, 0),
    coalesce(r.input_video_tokens, 0),
    coalesce(r.output_video_tokens, 0),
    coalesce(r.image_inputs, 0),
    coalesce(r.image_outputs, 0),
    coalesce(r.audio_inputs, 0),
    coalesce(r.audio_outputs, 0),
    coalesce(r.video_inputs, 0),
    coalesce(r.video_outputs, 0),
    coalesce(r.cached_read_tokens, 0),
    coalesce(r.cached_write_tokens, 0),
    coalesce(r.cached_read_text_tokens, 0),
    coalesce(r.cached_write_text_tokens, 0),
    coalesce(r.cached_write_text_tokens_5m, 0),
    coalesce(r.cached_write_text_tokens_1h, 0),
    coalesce(r.cached_read_image_tokens, 0),
    coalesce(r.cached_write_image_tokens, 0),
    coalesce(r.cached_read_audio_tokens, 0),
    coalesce(r.cached_write_audio_tokens, 0),
    coalesce(r.cached_read_video_tokens, 0),
    coalesce(r.cached_write_video_tokens, 0),
    coalesce(r.input_quad_tokens, 0),
    coalesce(r.output_quad_tokens, 0),
    coalesce(r.total_quad_tokens, 0),
    coalesce(r.text_quad_tokens, 0),
    coalesce(r.rerank_quad_tokens, 0),
    coalesce(r.embedding_quad_tokens, 0),
    coalesce(r.moderation_quad_tokens, 0),
    coalesce(r.ocr_quad_tokens, 0),
    coalesce(r.image_megapixels, 0),
    coalesce(r.audio_seconds, 0),
    coalesce(r.video_pixel_seconds, 0),
    coalesce(r.input_characters, 0),
    coalesce(r.output_characters, 0),
    coalesce(r.total_characters, 0),
    coalesce(r.total_cost_nanos, 0),
    coalesce(r.latency_sum_ms, 0),
    coalesce(r.latency_samples, 0),
    coalesce(r.generation_sum_ms, 0),
    coalesce(r.generation_samples, 0),
    coalesce(r.throughput_sum, 0),
    coalesce(r.throughput_samples, 0),
    r.last_request_at,
    now()
  from public.gateway_request_usage_rollup_rows(p_since, p_until) r;

  with normalized as (
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
      public.gateway_usage_nonnegative_bigint(
        coalesce(
          public.gateway_usage_total_tokens(gr.usage),
          gr.usage_total_tokens,
          0
        )
      ) as total_tokens,
      public.gateway_usage_nonnegative_bigint(
        coalesce(
          public.gateway_usage_numeric_field(
            gr.usage,
            'input_tokens',
            'prompt_tokens',
            'inputTokens',
            'promptTokens',
            'promptTokenCount',
            'total_input_tokens',
            'totalInputTokens'
          ),
          gr.usage_input_tokens,
          0
        )
      ) as input_tokens,
      public.gateway_usage_nonnegative_bigint(
        coalesce(
          public.gateway_usage_numeric_field(
            gr.usage,
            'output_tokens',
            'completion_tokens',
            'outputTokens',
            'completionTokens',
            'candidatesTokenCount',
            'total_output_tokens',
            'totalOutputTokens'
          ),
          gr.usage_output_tokens,
          0
        )
      ) as output_tokens,
      greatest(coalesce(gr.usage_embedding_tokens, 0), 0)::bigint as embedding_tokens,
      greatest(coalesce(gr.usage_video_seconds, 0), 0)::numeric as video_seconds
    from public.gateway_requests gr
    where gr.created_at >= p_since
      and gr.created_at < p_until
  ),
  rolled as (
    select
      n.day_bucket,
      n.model_id,
      n.provider_id,
      n.endpoint,
      sum(n.total_tokens)::bigint as total_tokens,
      sum(n.input_tokens)::bigint as input_tokens,
      sum(n.output_tokens)::bigint as output_tokens,
      sum(n.embedding_tokens)::bigint as embedding_tokens,
      sum(n.video_seconds)::numeric as video_seconds
    from normalized n
    where n.model_id is not null
      and n.model_id <> ''
    group by n.day_bucket, n.model_id, n.provider_id, n.endpoint
  )
  update public.gateway_model_usage_daily d
  set
    total_tokens = greatest(d.total_tokens, r.total_tokens),
    input_tokens = greatest(d.input_tokens, r.input_tokens),
    output_tokens = greatest(d.output_tokens, r.output_tokens),
    input_text_tokens = greatest(
      d.input_text_tokens,
      case
        when d.endpoint in ('embeddings', 'rerank') then 0
        else r.input_tokens
      end
    ),
    output_text_tokens = greatest(
      d.output_text_tokens,
      case
        when d.endpoint in ('embeddings', 'rerank') then 0
        else r.output_tokens
      end
    ),
    embedding_tokens = r.embedding_tokens,
    video_seconds = r.video_seconds
  from rolled r
  where d.day_bucket = r.day_bucket
    and d.model_id = r.model_id
    and d.provider_id = r.provider_id
    and d.endpoint = r.endpoint
    and d.day_bucket >= v_since_date
    and d.day_bucket <= v_until_date;

  delete from public.public_app_model_usage_daily d
  where d.day_bucket >= v_since_date
    and d.day_bucket <= v_until_date;

  insert into public.public_app_model_usage_daily (
    day_bucket,
    app_id,
    model_id,
    requests,
    tokens,
    refreshed_at
  )
  select
    date_trunc('day', gr.created_at at time zone 'utc')::date as day_bucket,
    gr.app_id::text as app_id,
    coalesce(
      nullif(gr.canonical_model_id, ''),
      public.resolve_public_model_id(gr.model_id, gr.provider),
      nullif(gr.routed_model_id, ''),
      nullif(gr.requested_model_id, ''),
      nullif(gr.model_id, ''),
      'unknown'
    ) as model_id,
    count(*)::bigint as requests,
    sum(
      public.gateway_usage_nonnegative_bigint(
        coalesce(
          public.gateway_usage_total_tokens(gr.usage),
          gr.usage_total_tokens,
          0
        )
      )
    )::bigint as tokens,
    now() as refreshed_at
  from public.gateway_requests gr
  where gr.created_at >= p_since
    and gr.created_at < p_until
    and gr.app_id is not null
    and gr.success is true
  group by 1, 2, 3;

  perform public.refresh_public_usage_rollups(p_since);
end;
$$;

grant execute on function public.refresh_public_leaderboard_rollups(timestamptz, timestamptz)
  to service_role;

drop function if exists public.get_public_usage_timeseries(text, text, integer);

create or replace function public.get_public_usage_timeseries(
  p_time_range text default 'week',
  p_bucket_size text default 'hour',
  p_top_n integer default 10
)
returns table (
  bucket timestamp with time zone,
  model_id text,
  requests bigint,
  tokens bigint,
  colour text
)
language plpgsql
stable
as $$
#variable_conflict use_column
declare
  v_since date;
begin
  case p_time_range
    when '24h' then v_since := (now() at time zone 'utc')::date - 1;
    when 'today' then v_since := (now() at time zone 'utc')::date;
    when 'week' then v_since := (now() at time zone 'utc')::date - 7;
    when 'month' then v_since := (now() at time zone 'utc')::date - 30;
    when 'year' then v_since := (now() at time zone 'utc')::date - 365;
    else v_since := (now() at time zone 'utc')::date - 7;
  end case;
  return query
  with base as (
    select
      case
        when p_bucket_size = 'month' then date_trunc('month', d.day_bucket::timestamp)::timestamptz
        when p_bucket_size = 'week' then date_trunc('week', d.day_bucket::timestamp)::timestamptz
        else d.day_bucket::timestamptz
      end as time_bucket,
      d.model_id,
      sum(d.requests)::bigint as req_count,
      sum(d.total_tokens)::bigint as tok_count
    from public.gateway_model_usage_daily d
    where d.day_bucket >= v_since
    group by 1, 2
  ),
  ranked_base as (
    select
      b.*,
      row_number() over (
        partition by b.time_bucket
        order by b.tok_count desc, b.req_count desc, b.model_id
      ) as bucket_rank
    from base b
    where lower(b.model_id) not in ('unknown', 'other')
      and b.tok_count > 0
  ),
  bucketed as (
    select
      b.time_bucket,
      case
        when rb.bucket_rank <= greatest(p_top_n, 1) then b.model_id
        else 'Other'
      end as model_group,
      sum(b.req_count)::bigint as req_count,
      sum(b.tok_count)::bigint as tok_count
    from base b
    left join ranked_base rb
      on rb.time_bucket = b.time_bucket
      and rb.model_id = b.model_id
    where lower(b.model_id) <> 'unknown'
      and b.tok_count > 0
    group by b.time_bucket, model_group
  )
  select
    b.time_bucket as bucket,
    b.model_group as model_id,
    b.req_count as requests,
    b.tok_count as tokens,
    case
      when b.model_group = 'Other' then null
      else org.colour
    end as colour
  from bucketed b
  left join public.data_models dm on dm.model_id = b.model_group
  left join public.data_organisations org on dm.organisation_id = org.organisation_id
  where b.tok_count > 0
  order by b.time_bucket, b.tok_count desc;
end;
$$;

grant execute on function public.get_public_usage_timeseries(text, text, integer)
  to anon, authenticated, service_role;

drop function if exists public.get_public_modality_usage_timeseries(text, text, integer);

create or replace function public.get_public_modality_usage_timeseries(
  p_metric text,
  p_time_range text default 'year',
  p_top_n integer default 20
)
returns table (
  bucket timestamp with time zone,
  model_id text,
  requests bigint,
  tokens numeric,
  colour text
)
language plpgsql
stable
as $$
declare
  v_since date;
begin
  case p_time_range
    when '24h' then v_since := (now() at time zone 'utc')::date - 1;
    when 'today' then v_since := (now() at time zone 'utc')::date;
    when 'week' then v_since := (now() at time zone 'utc')::date - 7;
    when 'month' then v_since := (now() at time zone 'utc')::date - 30;
    when 'year' then v_since := (now() at time zone 'utc')::date - 365;
    else v_since := (now() at time zone 'utc')::date - 365;
  end case;

  return query
  with daily as (
    select
      date_trunc('week', d.day_bucket::timestamp)::timestamptz as time_bucket,
      d.model_id,
      sum(d.requests)::bigint as req_count,
      sum(
        case p_metric
          when 'text_tokens' then d.input_text_tokens + d.output_text_tokens
          when 'image_inputs' then d.image_inputs
          when 'image_outputs' then d.image_outputs
          when 'audio_tokens' then d.input_audio_tokens + d.output_audio_tokens
          when 'audio_seconds' then d.audio_seconds
          when 'video_tokens' then d.input_video_tokens + d.output_video_tokens
          when 'video_seconds' then d.video_seconds
          when 'cached_tokens' then d.cached_read_tokens + d.cached_write_tokens
          when 'embedding_tokens' then d.embedding_tokens
          when 'rerank_quad_tokens' then d.rerank_quad_tokens
          else 0
        end
      )::numeric as metric_value
    from public.gateway_model_usage_daily d
    where d.day_bucket >= v_since
    group by 1, 2
  ),
  ranked_daily as (
    select
      d.*,
      row_number() over (
        partition by d.time_bucket
        order by d.metric_value desc, d.req_count desc, d.model_id
      ) as bucket_rank
    from daily d
    where lower(d.model_id) not in ('unknown', 'other')
      and d.metric_value > 0
  ),
  bucketed as (
    select
      d.time_bucket,
      case
        when rd.bucket_rank <= greatest(p_top_n, 1) then d.model_id
        else 'Other'
      end as model_group,
      sum(d.req_count)::bigint as req_count,
      sum(d.metric_value)::numeric as metric_value
    from daily d
    left join ranked_daily rd
      on rd.time_bucket = d.time_bucket
      and rd.model_id = d.model_id
    where d.metric_value > 0
      and lower(d.model_id) <> 'unknown'
    group by d.time_bucket, model_group
  )
  select
    b.time_bucket as bucket,
    b.model_group as model_id,
    b.req_count as requests,
    b.metric_value as tokens,
    case
      when b.model_group = 'Other' then null
      else org.colour
    end as colour
  from bucketed b
  left join public.data_models dm on dm.model_id = b.model_group
  left join public.data_organisations org on dm.organisation_id = org.organisation_id
  order by b.time_bucket, b.metric_value desc;
end;
$$;

grant execute on function public.get_public_modality_usage_timeseries(text, text, integer)
  to anon, authenticated, service_role;

drop function if exists public.get_public_multimodal_breakdown(text);

create or replace function public.get_public_multimodal_breakdown(
  p_time_range text default 'week'
)
returns table (
  model_id text,
  text_tokens bigint,
  audio_tokens bigint,
  video_tokens bigint,
  cached_tokens bigint,
  image_count bigint,
  input_text_tokens bigint,
  output_text_tokens bigint,
  input_image_tokens bigint,
  output_image_tokens bigint,
  image_inputs bigint,
  image_outputs bigint,
  image_megapixels numeric,
  input_audio_tokens bigint,
  output_audio_tokens bigint,
  audio_inputs bigint,
  audio_outputs bigint,
  audio_seconds numeric,
  input_video_tokens bigint,
  output_video_tokens bigint,
  video_inputs bigint,
  video_outputs bigint,
  video_seconds numeric,
  video_pixel_seconds numeric,
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
  input_quad_tokens bigint,
  output_quad_tokens bigint,
  total_quad_tokens bigint,
  text_quad_tokens bigint,
  rerank_quad_tokens bigint,
  embedding_tokens bigint,
  embedding_quad_tokens bigint,
  total_requests bigint,
  total_cost_nanos bigint,
  avg_latency_ms numeric,
  avg_generation_ms numeric,
  avg_throughput numeric
)
language plpgsql
stable
as $$
declare
  v_since date;
begin
  case p_time_range
    when 'today' then v_since := (now() at time zone 'utc')::date;
    when 'week' then v_since := (now() at time zone 'utc')::date - 7;
    when 'month' then v_since := (now() at time zone 'utc')::date - 30;
    else v_since := (now() at time zone 'utc')::date - 7;
  end case;

  return query
  select
    d.model_id,
    sum(d.input_text_tokens + d.output_text_tokens)::bigint as text_tokens,
    sum(d.input_audio_tokens + d.output_audio_tokens)::bigint as audio_tokens,
    sum(d.input_video_tokens + d.output_video_tokens)::bigint as video_tokens,
    sum(d.cached_read_tokens + d.cached_write_tokens)::bigint as cached_tokens,
    sum(d.image_inputs + d.image_outputs)::bigint as image_count,
    sum(d.input_text_tokens)::bigint as input_text_tokens,
    sum(d.output_text_tokens)::bigint as output_text_tokens,
    sum(d.input_image_tokens)::bigint as input_image_tokens,
    sum(d.output_image_tokens)::bigint as output_image_tokens,
    sum(d.image_inputs)::bigint as image_inputs,
    sum(d.image_outputs)::bigint as image_outputs,
    sum(d.image_megapixels)::numeric as image_megapixels,
    sum(d.input_audio_tokens)::bigint as input_audio_tokens,
    sum(d.output_audio_tokens)::bigint as output_audio_tokens,
    sum(d.audio_inputs)::bigint as audio_inputs,
    sum(d.audio_outputs)::bigint as audio_outputs,
    sum(d.audio_seconds)::numeric as audio_seconds,
    sum(d.input_video_tokens)::bigint as input_video_tokens,
    sum(d.output_video_tokens)::bigint as output_video_tokens,
    sum(d.video_inputs)::bigint as video_inputs,
    sum(d.video_outputs)::bigint as video_outputs,
    sum(d.video_seconds)::numeric as video_seconds,
    sum(d.video_pixel_seconds)::numeric as video_pixel_seconds,
    sum(d.cached_read_tokens)::bigint as cached_read_tokens,
    sum(d.cached_write_tokens)::bigint as cached_write_tokens,
    sum(d.cached_read_text_tokens)::bigint as cached_read_text_tokens,
    sum(d.cached_write_text_tokens)::bigint as cached_write_text_tokens,
    sum(d.cached_read_image_tokens)::bigint as cached_read_image_tokens,
    sum(d.cached_write_image_tokens)::bigint as cached_write_image_tokens,
    sum(d.cached_read_audio_tokens)::bigint as cached_read_audio_tokens,
    sum(d.cached_write_audio_tokens)::bigint as cached_write_audio_tokens,
    sum(d.cached_read_video_tokens)::bigint as cached_read_video_tokens,
    sum(d.cached_write_video_tokens)::bigint as cached_write_video_tokens,
    sum(d.input_quad_tokens)::bigint as input_quad_tokens,
    sum(d.output_quad_tokens)::bigint as output_quad_tokens,
    sum(d.total_quad_tokens)::bigint as total_quad_tokens,
    sum(d.text_quad_tokens)::bigint as text_quad_tokens,
    sum(d.rerank_quad_tokens)::bigint as rerank_quad_tokens,
    sum(d.embedding_tokens)::bigint as embedding_tokens,
    sum(d.embedding_quad_tokens)::bigint as embedding_quad_tokens,
    sum(d.requests)::bigint as total_requests,
    sum(d.total_cost_nanos)::bigint as total_cost_nanos,
    case
      when sum(d.latency_samples) > 0
      then round(sum(d.latency_sum_ms)::numeric / sum(d.latency_samples)::numeric, 2)
      else null
    end as avg_latency_ms,
    case
      when sum(d.generation_samples) > 0
      then round(sum(d.generation_sum_ms)::numeric / sum(d.generation_samples)::numeric, 2)
      else null
    end as avg_generation_ms,
    case
      when sum(d.throughput_samples) > 0
      then round(sum(d.throughput_sum)::numeric / sum(d.throughput_samples)::numeric, 2)
      else null
    end as avg_throughput
  from public.gateway_model_usage_daily d
  where d.day_bucket >= v_since
    and lower(d.model_id) not in ('unknown', 'other')
  group by d.model_id
  having
    sum(d.input_text_tokens + d.output_text_tokens) > 0
    or sum(d.input_image_tokens + d.output_image_tokens) > 0
    or sum(d.image_inputs + d.image_outputs) > 0
    or sum(d.input_audio_tokens + d.output_audio_tokens) > 0
    or sum(d.audio_seconds) > 0
    or sum(d.input_video_tokens + d.output_video_tokens) > 0
    or sum(d.video_seconds) > 0
    or sum(d.rerank_quad_tokens) > 0
    or sum(d.embedding_tokens) > 0
  order by (
    sum(d.input_text_tokens + d.output_text_tokens)
    + sum(d.input_image_tokens + d.output_image_tokens)
    + sum(d.input_audio_tokens + d.output_audio_tokens)
    + sum(d.input_video_tokens + d.output_video_tokens)
    + sum(d.embedding_tokens)
    + sum(d.rerank_quad_tokens)
  ) desc;
end;
$$;

grant execute on function public.get_public_multimodal_breakdown(text)
  to anon, authenticated, service_role;

drop function if exists public.get_public_model_rankings(text, text, integer);

create or replace function public.get_public_model_rankings(
  p_time_range text default 'week',
  p_metric text default 'tokens',
  p_limit integer default 50
)
returns table (
  model_id text,
  provider text,
  requests bigint,
  total_tokens bigint,
  input_tokens bigint,
  output_tokens bigint,
  total_cost_usd numeric,
  median_latency_ms numeric,
  median_throughput numeric,
  success_rate numeric,
  rank integer,
  prev_rank integer,
  trend text
)
language plpgsql
stable
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_since date;
  v_prev_since date;
  v_prev_until date;
begin
  case p_time_range
    when 'today' then
      v_since := v_today;
      v_prev_since := v_today - 1;
      v_prev_until := v_today;
    when 'week' then
      v_since := v_today - 7;
      v_prev_since := v_today - 14;
      v_prev_until := v_today - 7;
    when 'month' then
      v_since := v_today - 30;
      v_prev_since := v_today - 60;
      v_prev_until := v_today - 30;
    else
      v_since := v_today - 365;
      v_prev_since := v_since;
      v_prev_until := v_since;
  end case;

  return query
  with current_period as (
    select
      d.model_id,
      d.provider_id as provider,
      sum(d.requests)::bigint as req_count,
      sum(d.total_tokens)::bigint as total_tok,
      sum(d.input_tokens)::bigint as input_tok,
      sum(d.output_tokens)::bigint as output_tok,
      sum(d.total_cost_nanos)::bigint as total_cost_nano,
      sum(d.success_requests)::bigint as success_req_count,
      sum(d.latency_sum_ms)::numeric as latency_sum,
      sum(d.latency_samples)::bigint as latency_samples,
      sum(d.throughput_sum)::numeric as throughput_sum,
      sum(d.throughput_samples)::bigint as throughput_samples
    from public.gateway_model_usage_daily d
    where d.day_bucket >= v_since
      and lower(d.model_id) not in ('unknown', 'other')
      and d.provider_id is not null
      and d.provider_id <> ''
    group by d.model_id, d.provider_id
  ),
  previous_period as (
    select
      d.model_id,
      d.provider_id as provider,
      sum(d.requests)::bigint as req_count,
      sum(d.total_tokens)::bigint as total_tok,
      sum(d.total_cost_nanos)::bigint as total_cost_nano
    from public.gateway_model_usage_daily d
    where d.day_bucket >= v_prev_since
      and d.day_bucket < v_prev_until
      and lower(d.model_id) not in ('unknown', 'other')
      and d.provider_id is not null
      and d.provider_id <> ''
    group by d.model_id, d.provider_id
  ),
  ranked_current as (
    select
      cp.*,
      row_number() over (
        order by
          case p_metric
            when 'requests' then cp.req_count::numeric
            when 'cost' then cp.total_cost_nano::numeric
            else cp.total_tok::numeric
          end desc
      ) as rk
    from current_period cp
    where cp.req_count > 0
  ),
  ranked_previous as (
    select
      pp.model_id,
      pp.provider,
      row_number() over (
        order by
          case p_metric
            when 'requests' then pp.req_count::numeric
            when 'cost' then pp.total_cost_nano::numeric
            else pp.total_tok::numeric
          end desc
      ) as rk
    from previous_period pp
    where pp.req_count > 0
  )
  select
    rc.model_id,
    rc.provider,
    rc.req_count as requests,
    rc.total_tok as total_tokens,
    rc.input_tok as input_tokens,
    rc.output_tok as output_tokens,
    round((rc.total_cost_nano::numeric / 1000000000.0), 2) as total_cost_usd,
    round(
      case when rc.latency_samples > 0
        then rc.latency_sum / rc.latency_samples::numeric
        else null
      end,
      0
    ) as median_latency_ms,
    round(
      case when rc.throughput_samples > 0
        then rc.throughput_sum / rc.throughput_samples::numeric
        else null
      end,
      2
    ) as median_throughput,
    round(
      case when rc.req_count > 0
        then rc.success_req_count::numeric / rc.req_count::numeric
        else null
      end,
      4
    ) as success_rate,
    rc.rk::integer as rank,
    coalesce(rp.rk, 9999)::integer as prev_rank,
    case
      when rp.rk is null then 'new'
      when rp.rk > rc.rk then 'up'
      when rp.rk < rc.rk then 'down'
      else 'same'
    end as trend
  from ranked_current rc
  left join ranked_previous rp
    on rc.model_id = rp.model_id
   and rc.provider = rp.provider
  where rc.rk <= greatest(p_limit, 1)
  order by rc.rk;
end;
$$;

grant execute on function public.get_public_model_rankings(text, text, integer)
  to anon, authenticated, service_role;

drop function if exists public.get_public_model_performance(integer, integer);

create or replace function public.get_public_model_performance(
  p_hours integer default 24,
  p_min_requests integer default 0
)
returns table (
  model_id text,
  provider text,
  requests bigint,
  cost_per_1m_tokens numeric,
  median_latency_ms numeric,
  p95_latency_ms numeric,
  median_throughput numeric,
  success_rate numeric
)
language plpgsql
stable
as $$
declare
  v_since date := ((now() at time zone 'utc')::date - greatest(ceil(greatest(p_hours, 1)::numeric / 24.0)::int, 1));
begin
  return query
  with grouped as (
    select
      d.model_id,
      d.provider_id as provider,
      sum(d.requests)::bigint as req_count,
      sum(d.total_tokens)::bigint as total_tok,
      sum(d.total_cost_nanos)::bigint as total_cost_nano,
      sum(d.success_requests)::bigint as success_req_count,
      sum(d.latency_sum_ms)::numeric as latency_sum,
      sum(d.latency_samples)::bigint as latency_samples,
      sum(d.throughput_sum)::numeric as throughput_sum,
      sum(d.throughput_samples)::bigint as throughput_samples
    from public.gateway_model_usage_daily d
    where d.day_bucket >= v_since
      and lower(d.model_id) not in ('unknown', 'other')
      and d.provider_id is not null
      and d.provider_id <> ''
    group by d.model_id, d.provider_id
  )
  select
    g.model_id,
    g.provider,
    g.req_count as requests,
    case
      when g.total_tok > 0 then
        round((g.total_cost_nano::numeric / 1000000000.0) / (g.total_tok::numeric / 1000000.0), 2)
      else 0
    end as cost_per_1m_tokens,
    round(
      case when g.latency_samples > 0
        then g.latency_sum / g.latency_samples::numeric
        else null
      end,
      0
    ) as median_latency_ms,
    round(
      case when g.latency_samples > 0
        then g.latency_sum / g.latency_samples::numeric
        else null
      end,
      0
    ) as p95_latency_ms,
    round(
      case when g.throughput_samples > 0
        then g.throughput_sum / g.throughput_samples::numeric
        else null
      end,
      2
    ) as median_throughput,
    round(
      case when g.req_count > 0
        then g.success_req_count::numeric / g.req_count::numeric
        else null
      end,
      4
    ) as success_rate
  from grouped g
  where g.req_count >= p_min_requests
  order by g.req_count desc;
end;
$$;

grant execute on function public.get_public_model_performance(integer, integer)
  to anon, authenticated, service_role;

drop function if exists public.get_public_trending_models(integer, integer);

create or replace function public.get_public_trending_models(
  p_limit integer default 20,
  p_min_requests integer default 0
)
returns table (
  model_id text,
  provider text,
  current_week_requests bigint,
  previous_week_requests bigint,
  two_weeks_ago_requests bigint,
  velocity numeric,
  momentum_score numeric
)
language plpgsql
stable
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
begin
  return query
  with weekly_stats as (
    select
      d.model_id,
      d.provider_id as provider,
      sum(d.requests) filter (where d.day_bucket >= v_today - 7)::bigint as week_0,
      sum(d.requests) filter (
        where d.day_bucket >= v_today - 14
          and d.day_bucket < v_today - 7
      )::bigint as week_1,
      sum(d.requests) filter (
        where d.day_bucket >= v_today - 21
          and d.day_bucket < v_today - 14
      )::bigint as week_2
    from public.gateway_model_usage_daily d
    where d.day_bucket >= v_today - 21
      and lower(d.model_id) not in ('unknown', 'other')
      and d.provider_id is not null
      and d.provider_id <> ''
    group by d.model_id, d.provider_id
    having coalesce(sum(d.requests) filter (where d.day_bucket >= v_today - 7), 0) >= p_min_requests
  )
  select
    ws.model_id,
    ws.provider,
    coalesce(ws.week_0, 0)::bigint as current_week_requests,
    coalesce(ws.week_1, 0)::bigint as previous_week_requests,
    coalesce(ws.week_2, 0)::bigint as two_weeks_ago_requests,
    ((coalesce(ws.week_0, 0) - coalesce(ws.week_1, 0)) - (coalesce(ws.week_1, 0) - coalesce(ws.week_2, 0)))::numeric as velocity,
    (((coalesce(ws.week_0, 0) - coalesce(ws.week_1, 0)) - (coalesce(ws.week_1, 0) - coalesce(ws.week_2, 0))) * 2.0 + (coalesce(ws.week_0, 0) - coalesce(ws.week_1, 0)))::numeric as momentum_score
  from weekly_stats ws
  where coalesce(ws.week_0, 0) > coalesce(ws.week_1, 0)
  order by momentum_score desc
  limit greatest(p_limit, 1);
end;
$$;

grant execute on function public.get_public_trending_models(integer, integer)
  to anon, authenticated, service_role;

drop function if exists public.get_public_market_share(text, text);

create or replace function public.get_public_market_share(
  p_dimension text default 'organization',
  p_time_range text default 'week'
)
returns table (
  name text,
  requests bigint,
  tokens bigint,
  share_pct numeric
)
language plpgsql
stable
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_since date;
begin
  case p_time_range
    when 'today' then v_since := v_today;
    when 'week' then v_since := v_today - 7;
    when 'month' then v_since := v_today - 30;
    else v_since := v_today - 7;
  end case;

  if p_dimension = 'organization' then
    return query
    with base as (
      select
        d.model_id,
        sum(d.success_requests)::bigint as requests,
        sum(d.total_tokens)::bigint as tokens
      from public.gateway_model_usage_daily d
      where d.day_bucket >= v_since
        and lower(d.model_id) not in ('unknown', 'other')
      group by d.model_id
    ),
    grouped as (
      select
        coalesce(org.name, dm.organisation_id) as org_name,
        sum(b.requests)::bigint as req_count,
        sum(b.tokens)::bigint as tok_count
      from base b
      join public.data_models dm on dm.model_id = b.model_id
      left join public.data_organisations org on dm.organisation_id = org.organisation_id
      where dm.organisation_id is not null
      group by org.name, dm.organisation_id
    ),
    totals as (
      select sum(g.req_count)::numeric as total_requests
      from grouped g
    )
    select
      g.org_name as name,
      g.req_count as requests,
      g.tok_count as tokens,
      round((g.req_count::numeric / nullif(t.total_requests, 0) * 100)::numeric, 2) as share_pct
    from grouped g
    cross join totals t
    where g.req_count > 0
    order by g.req_count desc;
  else
    return query
    with grouped as (
      select
        d.provider_id as provider,
        sum(d.success_requests)::bigint as req_count,
        sum(d.total_tokens)::bigint as tok_count
      from public.gateway_model_usage_daily d
      where d.day_bucket >= v_since
        and d.provider_id is not null
        and d.provider_id <> ''
        and lower(d.provider_id) not in ('unknown', 'other')
      group by d.provider_id
    ),
    totals as (
      select sum(g.req_count)::numeric as total_requests
      from grouped g
    )
    select
      g.provider as name,
      g.req_count as requests,
      g.tok_count as tokens,
      round((g.req_count::numeric / nullif(t.total_requests, 0) * 100)::numeric, 2) as share_pct
    from grouped g
    cross join totals t
    where g.req_count > 0
    order by g.req_count desc;
  end if;
end;
$$;

grant execute on function public.get_public_market_share(text, text)
  to anon, authenticated, service_role;

drop function if exists public.get_public_top_apps(integer, text);

create or replace function public.get_public_top_apps(
  p_limit integer default 20,
  p_time_range text default 'week'
)
returns table (
  app_id text,
  app_name text,
  requests bigint,
  tokens bigint,
  unique_models integer
)
language plpgsql
stable
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_since date;
begin
  case p_time_range
    when 'today' then v_since := v_today;
    when 'week' then v_since := v_today - 7;
    when '4w' then v_since := v_today - 28;
    when 'month' then v_since := v_today - 30;
    else v_since := v_today - 7;
  end case;

  return query
  with grouped as (
    select
      d.app_id,
      sum(d.requests)::bigint as req_count,
      sum(d.tokens)::bigint as tok_count,
      count(distinct d.model_id)::integer as uniq_models
    from public.public_app_model_usage_daily d
    where d.day_bucket >= v_since
    group by d.app_id
  )
  select
    g.app_id,
    coalesce(aa.title, 'App-' || substring(md5(g.app_id), 1, 8)) as app_name,
    g.req_count as requests,
    g.tok_count as tokens,
    g.uniq_models as unique_models
  from grouped g
  left join public.api_apps aa on aa.id::text = g.app_id
  order by g.req_count desc, g.tok_count desc
  limit greatest(p_limit, 1);
end;
$$;

grant execute on function public.get_public_top_apps(integer, text)
  to anon, authenticated, service_role;

drop function if exists public.get_public_trending_apps(integer, bigint);

create or replace function public.get_public_trending_apps(
  p_limit integer default 20,
  p_min_week_tokens bigint default 0
)
returns table (
  app_id text,
  app_name text,
  current_week_tokens bigint,
  previous_week_tokens bigint,
  growth_tokens bigint,
  growth_pct numeric
)
language plpgsql
stable
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
begin
  return query
  with weekly as (
    select
      d.app_id,
      sum(d.tokens) filter (where d.day_bucket >= v_today - 7)::bigint as week_0_tokens,
      sum(d.tokens) filter (
        where d.day_bucket >= v_today - 14
          and d.day_bucket < v_today - 7
      )::bigint as week_1_tokens
    from public.public_app_model_usage_daily d
    where d.day_bucket >= v_today - 14
    group by d.app_id
  )
  select
    w.app_id,
    coalesce(aa.title, 'App-' || substring(md5(w.app_id), 1, 8)) as app_name,
    coalesce(w.week_0_tokens, 0)::bigint as current_week_tokens,
    coalesce(w.week_1_tokens, 0)::bigint as previous_week_tokens,
    (coalesce(w.week_0_tokens, 0) - coalesce(w.week_1_tokens, 0))::bigint as growth_tokens,
    case
      when coalesce(w.week_1_tokens, 0) > 0
        then round(((coalesce(w.week_0_tokens, 0) - coalesce(w.week_1_tokens, 0))::numeric / w.week_1_tokens::numeric) * 100, 2)
      when coalesce(w.week_0_tokens, 0) > 0
        then null
      else 0
    end as growth_pct
  from weekly w
  left join public.api_apps aa on aa.id::text = w.app_id
  where coalesce(w.week_0_tokens, 0) > coalesce(w.week_1_tokens, 0)
    and coalesce(w.week_0_tokens, 0) >= p_min_week_tokens
  order by (coalesce(w.week_0_tokens, 0) - coalesce(w.week_1_tokens, 0)) desc,
    coalesce(w.week_0_tokens, 0) desc
  limit greatest(p_limit, 1);
end;
$$;

grant execute on function public.get_public_trending_apps(integer, bigint)
  to anon, authenticated, service_role;

do $$
declare
  v_job_id int;
begin
  if to_regclass('cron.job') is null then
    return;
  end if;

  select jobid into v_job_id
  from cron.job
  where jobname = 'refresh-public-usage-rollups'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  select jobid into v_job_id
  from cron.job
  where jobname = 'refresh-public-leaderboard-rollups'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'refresh-public-leaderboard-rollups',
    '7 * * * *',
    $sql$select public.refresh_public_leaderboard_rollups(now() - interval '90 days', now());$sql$
  );
exception
  when others then
    null;
end $$;

select public.refresh_public_leaderboard_rollups(now() - interval '1 year', now());

comment on function public.refresh_public_leaderboard_rollups(timestamptz, timestamptz) is
  'Refreshes public leaderboard rollups from gateway_requests, then serves rankings from rollup tables.';
