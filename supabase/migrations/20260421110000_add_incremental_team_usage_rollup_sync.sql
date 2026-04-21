create table if not exists public.gateway_usage_rollup_team_request_state (
  request_row_id uuid primary key,
  request_created_at timestamptz not null,
  team_id uuid not null references public.teams (id) on delete cascade,
  bucket_15m timestamptz not null,
  key_id uuid null references public.keys (id) on delete set null,
  provider text not null,
  canonical_model_id text not null,
  requests bigint not null,
  success_requests bigint not null,
  total_tokens bigint not null,
  total_cost_nanos bigint not null,
  latency_sum_ms numeric not null,
  latency_samples bigint not null,
  throughput_sum numeric not null,
  throughput_samples bigint not null,
  updated_at timestamptz not null default now()
);

create index if not exists gateway_usage_rollup_team_request_state_team_bucket_idx
  on public.gateway_usage_rollup_team_request_state (team_id, bucket_15m desc);

create or replace function public.apply_team_usage_rollup_delta(
  p_bucket_15m timestamptz,
  p_workspace_id uuid,
  p_key_id uuid,
  p_provider text,
  p_canonical_model_id text,
  p_requests bigint,
  p_success_requests bigint,
  p_total_tokens bigint,
  p_total_cost_nanos bigint,
  p_latency_sum_ms numeric,
  p_latency_samples bigint,
  p_throughput_sum numeric,
  p_throughput_samples bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(p_requests, 0) = 0
    and coalesce(p_success_requests, 0) = 0
    and coalesce(p_total_tokens, 0) = 0
    and coalesce(p_total_cost_nanos, 0) = 0
    and coalesce(p_latency_sum_ms, 0) = 0
    and coalesce(p_latency_samples, 0) = 0
    and coalesce(p_throughput_sum, 0) = 0
    and coalesce(p_throughput_samples, 0) = 0 then
    return;
  end if;

  insert into public.gateway_usage_rollup_15m_team_provider_model (
    bucket_15m,
    team_id,
    key_id,
    provider,
    canonical_model_id,
    requests,
    success_requests,
    total_tokens,
    total_cost_nanos,
    latency_sum_ms,
    latency_samples,
    throughput_sum,
    throughput_samples
  )
  values (
    p_bucket_15m,
    p_workspace_id,
    p_key_id,
    p_provider,
    p_canonical_model_id,
    p_requests,
    p_success_requests,
    p_total_tokens,
    p_total_cost_nanos,
    p_latency_sum_ms,
    p_latency_samples,
    p_throughput_sum,
    p_throughput_samples
  )
  on conflict (
    bucket_15m,
    team_id,
    coalesce(key_id, '00000000-0000-0000-0000-000000000000'::uuid),
    provider,
    canonical_model_id
  )
  do update
  set
    requests = public.gateway_usage_rollup_15m_team_provider_model.requests + excluded.requests,
    success_requests = public.gateway_usage_rollup_15m_team_provider_model.success_requests + excluded.success_requests,
    total_tokens = public.gateway_usage_rollup_15m_team_provider_model.total_tokens + excluded.total_tokens,
    total_cost_nanos = public.gateway_usage_rollup_15m_team_provider_model.total_cost_nanos + excluded.total_cost_nanos,
    latency_sum_ms = public.gateway_usage_rollup_15m_team_provider_model.latency_sum_ms + excluded.latency_sum_ms,
    latency_samples = public.gateway_usage_rollup_15m_team_provider_model.latency_samples + excluded.latency_samples,
    throughput_sum = public.gateway_usage_rollup_15m_team_provider_model.throughput_sum + excluded.throughput_sum,
    throughput_samples = public.gateway_usage_rollup_15m_team_provider_model.throughput_samples + excluded.throughput_samples;

  delete from public.gateway_usage_rollup_15m_team_provider_model
  where bucket_15m = p_bucket_15m
    and team_id = p_workspace_id
    and coalesce(key_id, '00000000-0000-0000-0000-000000000000'::uuid) =
      coalesce(p_key_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and provider = p_provider
    and canonical_model_id = p_canonical_model_id
    and requests = 0
    and success_requests = 0
    and total_tokens = 0
    and total_cost_nanos = 0
    and latency_sum_ms = 0
    and latency_samples = 0
    and throughput_sum = 0
    and throughput_samples = 0;
end;
$$;

create or replace function public.upsert_gateway_request_into_team_usage_rollup(
  p_request_row_id uuid,
  p_request_created_at timestamptz,
  p_workspace_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.gateway_requests%rowtype;
  v_prev public.gateway_usage_rollup_team_request_state%rowtype;
  v_bucket_15m timestamptz;
  v_provider text;
  v_canonical_model_id text;
  v_requests bigint := 1;
  v_success_requests bigint;
  v_total_tokens bigint;
  v_total_cost_nanos bigint;
  v_latency_sum_ms numeric;
  v_latency_samples bigint;
  v_throughput_sum numeric;
  v_throughput_samples bigint;
begin
  if p_request_row_id is null or p_request_created_at is null or p_workspace_id is null then
    raise exception 'request_row_id_created_at_workspace_id_required';
  end if;

  select *
  into v_request
  from public.gateway_requests gr
  where gr.id = p_request_row_id
    and gr.created_at = p_request_created_at
    and gr.team_id = p_workspace_id
  limit 1;

  if not found then
    raise exception 'gateway_request_not_found';
  end if;

  v_bucket_15m := date_trunc('minute', v_request.created_at)
    - make_interval(mins => (extract(minute from v_request.created_at)::int % 15));
  v_provider := coalesce(nullif(v_request.provider, ''), 'unknown');
  v_canonical_model_id := coalesce(
    nullif(v_request.canonical_model_id, ''),
    public.resolve_public_model_id(v_request.model_id, v_request.provider),
    nullif(v_request.model_id, ''),
    'unknown'
  );
  v_success_requests := case when v_request.success then 1 else 0 end;
  v_total_tokens := public.gateway_usage_total_tokens(v_request.usage);
  v_total_cost_nanos := coalesce(v_request.cost_nanos, 0)::bigint;
  v_latency_sum_ms := coalesce(v_request.latency_ms, 0)::numeric;
  v_latency_samples := case when v_request.latency_ms is null then 0 else 1 end;
  v_throughput_sum := coalesce(v_request.throughput, 0)::numeric;
  v_throughput_samples := case when v_request.throughput is null then 0 else 1 end;

  select *
  into v_prev
  from public.gateway_usage_rollup_team_request_state s
  where s.request_row_id = p_request_row_id
  for update;

  if found
    and v_prev.request_created_at = v_request.created_at
    and v_prev.team_id = v_request.team_id
    and v_prev.bucket_15m = v_bucket_15m
    and v_prev.key_id is not distinct from v_request.key_id
    and v_prev.provider = v_provider
    and v_prev.canonical_model_id = v_canonical_model_id
    and v_prev.requests = v_requests
    and v_prev.success_requests = v_success_requests
    and v_prev.total_tokens = v_total_tokens
    and v_prev.total_cost_nanos = v_total_cost_nanos
    and v_prev.latency_sum_ms = v_latency_sum_ms
    and v_prev.latency_samples = v_latency_samples
    and v_prev.throughput_sum = v_throughput_sum
    and v_prev.throughput_samples = v_throughput_samples then
    update public.gateway_usage_rollup_team_request_state
    set updated_at = now()
    where request_row_id = p_request_row_id;
    return false;
  end if;

  if found then
    perform public.apply_team_usage_rollup_delta(
      v_prev.bucket_15m,
      v_prev.team_id,
      v_prev.key_id,
      v_prev.provider,
      v_prev.canonical_model_id,
      -v_prev.requests,
      -v_prev.success_requests,
      -v_prev.total_tokens,
      -v_prev.total_cost_nanos,
      -v_prev.latency_sum_ms,
      -v_prev.latency_samples,
      -v_prev.throughput_sum,
      -v_prev.throughput_samples
    );
  end if;

  perform public.apply_team_usage_rollup_delta(
    v_bucket_15m,
    v_request.team_id,
    v_request.key_id,
    v_provider,
    v_canonical_model_id,
    v_requests,
    v_success_requests,
    v_total_tokens,
    v_total_cost_nanos,
    v_latency_sum_ms,
    v_latency_samples,
    v_throughput_sum,
    v_throughput_samples
  );

  insert into public.gateway_usage_rollup_team_request_state (
    request_row_id,
    request_created_at,
    team_id,
    bucket_15m,
    key_id,
    provider,
    canonical_model_id,
    requests,
    success_requests,
    total_tokens,
    total_cost_nanos,
    latency_sum_ms,
    latency_samples,
    throughput_sum,
    throughput_samples,
    updated_at
  )
  values (
    v_request.id,
    v_request.created_at,
    v_request.team_id,
    v_bucket_15m,
    v_request.key_id,
    v_provider,
    v_canonical_model_id,
    v_requests,
    v_success_requests,
    v_total_tokens,
    v_total_cost_nanos,
    v_latency_sum_ms,
    v_latency_samples,
    v_throughput_sum,
    v_throughput_samples,
    now()
  )
  on conflict (request_row_id)
  do update
  set
    request_created_at = excluded.request_created_at,
    team_id = excluded.team_id,
    bucket_15m = excluded.bucket_15m,
    key_id = excluded.key_id,
    provider = excluded.provider,
    canonical_model_id = excluded.canonical_model_id,
    requests = excluded.requests,
    success_requests = excluded.success_requests,
    total_tokens = excluded.total_tokens,
    total_cost_nanos = excluded.total_cost_nanos,
    latency_sum_ms = excluded.latency_sum_ms,
    latency_samples = excluded.latency_samples,
    throughput_sum = excluded.throughput_sum,
    throughput_samples = excluded.throughput_samples,
    updated_at = now();

  return true;
end;
$$;

comment on function public.apply_team_usage_rollup_delta(
  timestamptz,
  uuid,
  uuid,
  text,
  text,
  bigint,
  bigint,
  bigint,
  bigint,
  numeric,
  bigint,
  numeric,
  bigint
) is 'Applies an additive delta to the team/key/provider/model 15-minute usage rollup.';

comment on function public.upsert_gateway_request_into_team_usage_rollup(uuid, timestamptz, uuid) is
  'Projects a single gateway_requests row into the team usage rollup and reconciles prior projections for mutable request rows.';

grant execute on function public.apply_team_usage_rollup_delta(
  timestamptz,
  uuid,
  uuid,
  text,
  text,
  bigint,
  bigint,
  bigint,
  bigint,
  numeric,
  bigint,
  numeric,
  bigint
) to service_role;

grant execute on function public.upsert_gateway_request_into_team_usage_rollup(uuid, timestamptz, uuid) to service_role;
