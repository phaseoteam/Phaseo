alter table public.gateway_requests
  add column if not exists api_model_id text null,
  add column if not exists pricing_plan text null,
  add column if not exists is_free_variant boolean not null default false;

comment on column public.gateway_requests.api_model_id is
  'Concrete provider API model id executed for this request, preserving variants such as :free, -fast, or -flex.';

comment on column public.gateway_requests.pricing_plan is
  'Pricing plan selected by the gateway pricing engine for this request, such as standard, free, priority, flex, or batch.';

comment on column public.gateway_requests.is_free_variant is
  'True when the executed request used a free model or free pricing plan.';

create index if not exists gateway_requests_api_model_created_idx
  on public.gateway_requests (api_model_id, created_at desc)
  where api_model_id is not null;

create index if not exists gateway_requests_pricing_plan_created_idx
  on public.gateway_requests (pricing_plan, created_at desc)
  where pricing_plan is not null;

update public.gateway_requests gr
set
  api_model_id = coalesce(
    nullif(gr.api_model_id, ''),
    nullif(gr.routed_model_id, ''),
    nullif(gr.model_id, ''),
    nullif(gr.requested_model_id, ''),
    nullif(gr.canonical_model_id, '')
  ),
  pricing_plan = coalesce(
    nullif(gr.pricing_plan, ''),
    case
      when lower(coalesce(gr.api_model_id, '')) like '%:free'
        or lower(coalesce(gr.routed_model_id, '')) like '%:free'
        or lower(coalesce(gr.model_id, '')) like '%:free'
        or lower(coalesce(gr.requested_model_id, '')) like '%:free'
        or lower(coalesce(gr.canonical_model_id, '')) like '%:free'
      then 'free'
      when jsonb_typeof(coalesce(gr.pricing_lines, '[]'::jsonb)) = 'array'
        and jsonb_array_length(coalesce(gr.pricing_lines, '[]'::jsonb)) > 0
        and not exists (
          select 1
          from jsonb_array_elements(coalesce(gr.pricing_lines, '[]'::jsonb)) as line(value)
          where coalesce(nullif(line.value->>'unit_price_usd', ''), '0')::numeric <> 0
            or coalesce(nullif(line.value->>'line_nanos', ''), '0')::numeric <> 0
        )
      then 'free'
      else null
    end
  ),
  is_free_variant = (
    lower(coalesce(gr.pricing_plan, '')) = 'free'
    or lower(coalesce(gr.api_model_id, '')) like '%:free'
    or lower(coalesce(gr.routed_model_id, '')) like '%:free'
    or lower(coalesce(gr.model_id, '')) like '%:free'
    or lower(coalesce(gr.requested_model_id, '')) like '%:free'
    or lower(coalesce(gr.canonical_model_id, '')) like '%:free'
    or (
      jsonb_typeof(coalesce(gr.pricing_lines, '[]'::jsonb)) = 'array'
      and jsonb_array_length(coalesce(gr.pricing_lines, '[]'::jsonb)) > 0
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(gr.pricing_lines, '[]'::jsonb)) as line(value)
        where coalesce(nullif(line.value->>'unit_price_usd', ''), '0')::numeric <> 0
          or coalesce(nullif(line.value->>'line_nanos', ''), '0')::numeric <> 0
      )
    )
  )
where gr.api_model_id is null
  or gr.pricing_plan is null
  or gr.is_free_variant is false;

update public.gateway_requests gr
set canonical_model_id = coalesce(
  nullif(gr.api_model_id, ''),
  nullif(gr.routed_model_id, ''),
  nullif(gr.model_id, ''),
  nullif(gr.requested_model_id, ''),
  nullif(gr.canonical_model_id, '')
)
where gr.is_free_variant is true
  and lower(coalesce(
    nullif(gr.api_model_id, ''),
    nullif(gr.routed_model_id, ''),
    nullif(gr.model_id, ''),
    nullif(gr.requested_model_id, ''),
    nullif(gr.canonical_model_id, '')
  )) like '%:free'
  and coalesce(gr.canonical_model_id, '') <> coalesce(
    nullif(gr.api_model_id, ''),
    nullif(gr.routed_model_id, ''),
    nullif(gr.model_id, ''),
    nullif(gr.requested_model_id, ''),
    nullif(gr.canonical_model_id, '')
  );

create or replace function public.public_leaderboard_model_id(
  p_canonical_model_id text,
  p_model_id text,
  p_requested_model_id text,
  p_routed_model_id text,
  p_api_model_id text,
  p_provider text,
  p_pricing_plan text,
  p_is_free_variant boolean
)
returns text
language sql
stable
as $$
  select case
    when coalesce(p_is_free_variant, false)
      or lower(coalesce(p_pricing_plan, '')) = 'free'
      or lower(coalesce(p_api_model_id, '')) like '%:free'
      or lower(coalesce(p_routed_model_id, '')) like '%:free'
      or lower(coalesce(p_model_id, '')) like '%:free'
      or lower(coalesce(p_requested_model_id, '')) like '%:free'
      or lower(coalesce(p_canonical_model_id, '')) like '%:free'
    then coalesce(
      nullif(p_api_model_id, ''),
      nullif(p_routed_model_id, ''),
      nullif(p_model_id, ''),
      nullif(p_requested_model_id, ''),
      nullif(p_canonical_model_id, ''),
      public.resolve_public_model_id(p_model_id, p_provider),
      'unknown'
    )
    else coalesce(
      nullif(p_canonical_model_id, ''),
      public.resolve_public_model_id(p_model_id, p_provider),
      nullif(p_routed_model_id, ''),
      nullif(p_requested_model_id, ''),
      nullif(p_api_model_id, ''),
      nullif(p_model_id, ''),
      'unknown'
    )
  end;
$$;

comment on function public.public_leaderboard_model_id(text, text, text, text, text, text, text, boolean) is
  'Returns the model id used for public leaderboard aggregation, preserving free executed variants while keeping paid rows canonical.';

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
      public.public_leaderboard_model_id(
        gr.canonical_model_id,
        gr.model_id,
        gr.requested_model_id,
        gr.routed_model_id,
        gr.api_model_id,
        gr.provider,
        gr.pricing_plan,
        gr.is_free_variant
      ) as model_id,
      coalesce(nullif(gr.provider, ''), 'unknown') as provider_id,
      coalesce(nullif(gr.endpoint, ''), 'unknown') as endpoint,
      public.gateway_usage_nonnegative_bigint(
        coalesce(public.gateway_usage_total_tokens(gr.usage), gr.usage_total_tokens, 0)
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
      case when d.endpoint in ('embeddings', 'rerank') then 0 else r.input_tokens end
    ),
    output_text_tokens = greatest(
      d.output_text_tokens,
      case when d.endpoint in ('embeddings', 'rerank') then 0 else r.output_tokens end
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
    public.public_leaderboard_model_id(
      gr.canonical_model_id,
      gr.model_id,
      gr.requested_model_id,
      gr.routed_model_id,
      gr.api_model_id,
      gr.provider,
      gr.pricing_plan,
      gr.is_free_variant
    ) as model_id,
    count(*)::bigint as requests,
    sum(
      public.gateway_usage_nonnegative_bigint(
        coalesce(public.gateway_usage_total_tokens(gr.usage), gr.usage_total_tokens, 0)
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

create or replace function public.refresh_public_model_user_usage_daily(
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
  delete from public.public_model_user_usage_daily d
  where d.day_bucket >= v_since_date
    and d.day_bucket <= v_until_date;

  insert into public.public_model_user_usage_daily (
    day_bucket,
    model_id,
    provider_id,
    actor_hash,
    requests,
    tokens,
    refreshed_at
  )
  with normalized as (
    select
      date_trunc('day', gr.created_at at time zone 'utc')::date as day_bucket,
      public.public_leaderboard_model_id(
        gr.canonical_model_id,
        gr.model_id,
        gr.requested_model_id,
        gr.routed_model_id,
        gr.api_model_id,
        gr.provider,
        gr.pricing_plan,
        gr.is_free_variant
      ) as model_id,
      coalesce(nullif(gr.provider, ''), 'unknown') as provider_id,
      coalesce(
        nullif(to_jsonb(gr)->>'oauth_user_id', ''),
        nullif(to_jsonb(gr)->>'end_user_id', ''),
        nullif(to_jsonb(gr)->>'workspace_id', ''),
        nullif(to_jsonb(gr)->>'team_id', ''),
        nullif(to_jsonb(gr)->>'key_id', '')
      ) as actor_key,
      public.gateway_usage_nonnegative_bigint(
        coalesce(public.gateway_usage_total_tokens(gr.usage), gr.usage_total_tokens, 0)
      ) as total_tokens
    from public.gateway_requests gr
    where gr.created_at >= p_since
      and gr.created_at < p_until
      and gr.success is true
  )
  select
    n.day_bucket,
    n.model_id,
    n.provider_id,
    md5('public-model-user:' || n.actor_key) as actor_hash,
    count(*)::bigint as requests,
    sum(n.total_tokens)::bigint as tokens,
    now() as refreshed_at
  from normalized n
  where n.actor_key is not null
    and n.model_id is not null
    and n.model_id <> ''
    and lower(n.model_id) not in ('unknown', 'other')
  group by n.day_bucket, n.model_id, n.provider_id, md5('public-model-user:' || n.actor_key);
end;
$$;

grant execute on function public.refresh_public_model_user_usage_daily(timestamptz, timestamptz)
  to service_role;

select public.refresh_public_leaderboard_rollups(now() - interval '1 year', now());
select public.refresh_public_model_user_usage_daily(now() - interval '1 year', now());
notify pgrst, 'reload schema';
