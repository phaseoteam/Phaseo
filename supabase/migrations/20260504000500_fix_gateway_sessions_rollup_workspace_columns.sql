-- Recreate Jobs/Sessions rollup RPCs after the team->workspace rename.
-- Some deployed environments still have function bodies referencing gr.team_id/op.team_id.

create or replace function public.get_gateway_sessions_rollup(
  p_team uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_limit integer default 100,
  p_offset integer default 0,
  p_app_id uuid default null,
  p_model_id text default null,
  p_provider text default null
)
returns table (
  session_id text,
  request_count bigint,
  total_cost_nanos numeric,
  total_cost_usd numeric,
  first_request_at timestamptz,
  last_request_at timestamptz,
  app_ids uuid[],
  model_ids text[],
  provider_ids text[],
  end_user_ids text[]
)
language sql
stable
as $$
  with filtered as (
    select gr.*
    from public.gateway_requests gr
    where gr.workspace_id = p_team
      and gr.created_at >= p_from
      and gr.created_at <= p_to
      and gr.session_id is not null
      and length(trim(gr.session_id)) > 0
      and (p_app_id is null or gr.app_id = p_app_id)
      and (p_model_id is null or gr.model_id = p_model_id)
      and (p_provider is null or gr.provider = p_provider)
  ),
  grouped as (
    select
      gr.session_id,
      count(*)::bigint as request_count,
      coalesce(sum(gr.cost_nanos::numeric), 0) as total_cost_nanos,
      min(gr.created_at) as first_request_at,
      max(gr.created_at) as last_request_at,
      array_remove(array_agg(distinct gr.app_id), null) as app_ids,
      array_remove(array_agg(distinct gr.model_id), null) as model_ids,
      array_remove(array_agg(distinct gr.provider), null) as provider_ids,
      array_remove(array_agg(distinct gr.end_user_id), null) as end_user_ids
    from filtered gr
    group by gr.session_id
  )
  select
    g.session_id,
    g.request_count,
    g.total_cost_nanos,
    g.total_cost_nanos / 1e9 as total_cost_usd,
    g.first_request_at,
    g.last_request_at,
    g.app_ids,
    g.model_ids,
    g.provider_ids,
    g.end_user_ids
  from grouped g
  order by g.last_request_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500))
  offset greatest(0, coalesce(p_offset, 0));
$$;

create or replace function public.get_gateway_jobs_rollup(
  p_team uuid,
  p_limit integer default 100,
  p_offset integer default 0,
  p_kind text default null,
  p_status text default null,
  p_session_id text default null,
  p_provider text default null
)
returns table (
  job_id uuid,
  kind text,
  internal_id text,
  request_id text,
  session_id text,
  app_id uuid,
  provider text,
  model text,
  status text,
  billed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  request_created_at timestamptz,
  request_endpoint text,
  request_model_id text,
  request_cost_nanos bigint,
  request_cost_usd numeric
)
language sql
stable
as $$
  with filtered_ops as (
    select op.*
    from public.gateway_async_operations op
    where op.workspace_id = p_team
      and (p_kind is null or op.kind = p_kind)
      and (p_status is null or op.status = p_status)
      and (p_session_id is null or op.session_id = p_session_id)
      and (p_provider is null or op.provider = p_provider)
  ),
  request_lookup as (
    select
      gr.workspace_id,
      gr.request_id,
      gr.created_at,
      gr.endpoint,
      gr.model_id,
      gr.cost_nanos,
      row_number() over (
        partition by gr.workspace_id, gr.request_id
        order by gr.created_at desc
      ) as rn
    from public.gateway_requests gr
    where gr.workspace_id = p_team
  )
  select
    op.id as job_id,
    op.kind,
    op.internal_id,
    op.request_id,
    op.session_id,
    op.app_id,
    op.provider,
    op.model,
    op.status,
    op.billed_at,
    op.created_at,
    op.updated_at,
    req.created_at as request_created_at,
    req.endpoint as request_endpoint,
    req.model_id as request_model_id,
    req.cost_nanos as request_cost_nanos,
    coalesce(req.cost_nanos, 0)::numeric / 1e9 as request_cost_usd
  from filtered_ops op
  left join request_lookup req
    on req.workspace_id = op.workspace_id
   and req.request_id = op.request_id
   and req.rn = 1
  order by op.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500))
  offset greatest(0, coalesce(p_offset, 0));
$$;

comment on function public.get_gateway_sessions_rollup(
  uuid, timestamptz, timestamptz, integer, integer, uuid, text, text
) is 'Workspace-scoped session rollup across gateway_requests with totals and distinct app/model/provider sets.';

comment on function public.get_gateway_jobs_rollup(
  uuid, integer, integer, text, text, text, text
) is 'Workspace-scoped async jobs rollup from gateway_async_operations with optional linkage to source gateway request.';
