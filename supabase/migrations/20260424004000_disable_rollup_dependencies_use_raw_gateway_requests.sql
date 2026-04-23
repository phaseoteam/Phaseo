-- Temporarily bypass workspace usage rollups and aggregate analytics directly from
-- gateway_requests while traffic is low.

create or replace function public.upsert_gateway_request_into_workspace_usage_rollup(
  p_request_row_id uuid,
  p_request_created_at timestamptz,
  p_workspace_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Rollup writes disabled intentionally.
  return false;
end;
$$;

create or replace function public.get_usage_chart_rollup(
    p_team uuid,
    p_from timestamp with time zone,
    p_to timestamp with time zone,
    p_bucket text,
    p_key_id uuid default null
)
returns table(
    bucket timestamp with time zone,
    provider text,
    model_id text,
    requests bigint,
    tokens bigint,
    cost numeric
) as $$
with base as (
    select
        gr.created_at,
        coalesce(nullif(gr.provider, ''), 'unknown') as provider,
        coalesce(
            nullif(gr.canonical_model_id, ''),
            public.resolve_public_model_id(gr.model_id, gr.provider),
            nullif(gr.model_id, ''),
            'unknown'
        ) as model_id,
        1::bigint as requests,
        public.gateway_usage_total_tokens(gr.usage)::bigint as total_tokens,
        coalesce(gr.cost_nanos, 0)::bigint as total_cost_nanos
    from public.gateway_requests gr
    where gr.workspace_id = p_team
      and gr.success is true
      and gr.created_at >= p_from
      and gr.created_at <= p_to
      and (p_key_id is null or gr.key_id = p_key_id)
),
bucketed as (
    select
        case
            when p_bucket = '5min' then
                date_trunc('minute', created_at)
                - make_interval(mins => (extract(minute from created_at)::int % 5))
            when p_bucket = 'hour' then date_trunc('hour', created_at)
            when p_bucket = 'day' then date_trunc('day', created_at)
            when p_bucket = 'month' then date_trunc('month', created_at)
            else date_trunc('day', created_at)
        end as bucket,
        provider,
        model_id,
        requests,
        total_tokens::bigint as tokens,
        total_cost_nanos::numeric / 1e9 as cost
    from base
)
select
    bucket,
    provider,
    model_id,
    sum(requests)::bigint as requests,
    sum(tokens)::bigint as tokens,
    sum(cost)::numeric as cost
from bucketed
group by bucket, provider, model_id
order by bucket asc;
$$ language sql stable;

-- Intentionally no compatibility views: rollup relations are being removed.
