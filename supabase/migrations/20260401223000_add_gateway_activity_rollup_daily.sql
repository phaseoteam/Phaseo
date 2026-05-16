-- Daily team-scoped rollup used by /v1/control/analytics and /v1/control/activity.
-- This avoids capped in-process scans and guarantees full-window analytics output.

create table if not exists public.gateway_activity_rollup_daily (
  day_bucket date not null,
  team_id uuid not null references public.teams (id) on delete cascade,
  model_id text not null,
  endpoint text not null,
  provider text not null,
  usage_nanos bigint not null default 0,
  byok_usage_nanos bigint not null default 0,
  requests bigint not null default 0,
  prompt_tokens bigint not null default 0,
  completion_tokens bigint not null default 0,
  reasoning_tokens bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (day_bucket, team_id, model_id, endpoint, provider)
);
create index if not exists gateway_activity_rollup_daily_team_day_idx
  on public.gateway_activity_rollup_daily (team_id, day_bucket desc);
create index if not exists gateway_activity_rollup_daily_team_day_provider_idx
  on public.gateway_activity_rollup_daily (team_id, day_bucket desc, provider);
create or replace function public.refresh_gateway_activity_rollup_daily(
  p_team_id uuid,
  p_start timestamptz,
  p_end timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start_day date;
  v_end_day date;
begin
  if p_team_id is null then
    raise exception 'team_id_required';
  end if;
  if p_start is null or p_end is null then
    raise exception 'start_end_required';
  end if;
  if p_end <= p_start then
    raise exception 'invalid_time_range';
  end if;

  v_start_day := (p_start at time zone 'UTC')::date;
  v_end_day := (p_end at time zone 'UTC')::date;

  if v_end_day <= v_start_day then
    raise exception 'invalid_day_range';
  end if;

  delete from public.gateway_activity_rollup_daily
  where team_id = p_team_id
    and day_bucket >= v_start_day
    and day_bucket < v_end_day;

  insert into public.gateway_activity_rollup_daily (
    day_bucket,
    team_id,
    model_id,
    endpoint,
    provider,
    usage_nanos,
    byok_usage_nanos,
    requests,
    prompt_tokens,
    completion_tokens,
    reasoning_tokens,
    updated_at
  )
  select
    (gr.created_at at time zone 'UTC')::date as day_bucket,
    gr.team_id,
    coalesce(nullif(gr.model_id, ''), 'unknown/unknown') as model_id,
    coalesce(nullif(gr.endpoint, ''), 'unknown') as endpoint,
    coalesce(nullif(gr.provider, ''), 'unknown') as provider,
    coalesce(sum(coalesce(gr.cost_nanos, 0)::bigint), 0)::bigint as usage_nanos,
    coalesce(
      sum(
        case
          when gr.byok is true then coalesce(gr.cost_nanos, 0)::bigint
          else 0::bigint
        end
      ),
      0
    )::bigint as byok_usage_nanos,
    count(*)::bigint as requests,
    coalesce(
      sum(
        coalesce(
          case
            when coalesce(gr.usage #>> '{input_tokens}', '') ~ '^\d+$'
              then (gr.usage #>> '{input_tokens}')::bigint
          end,
          case
            when coalesce(gr.usage #>> '{prompt_tokens}', '') ~ '^\d+$'
              then (gr.usage #>> '{prompt_tokens}')::bigint
          end,
          0::bigint
        )
      ),
      0
    )::bigint as prompt_tokens,
    coalesce(
      sum(
        coalesce(
          case
            when coalesce(gr.usage #>> '{output_tokens}', '') ~ '^\d+$'
              then (gr.usage #>> '{output_tokens}')::bigint
          end,
          case
            when coalesce(gr.usage #>> '{completion_tokens}', '') ~ '^\d+$'
              then (gr.usage #>> '{completion_tokens}')::bigint
          end,
          0::bigint
        )
      ),
      0
    )::bigint as completion_tokens,
    coalesce(
      sum(
        coalesce(
          case
            when coalesce(gr.usage #>> '{reasoning_tokens}', '') ~ '^\d+$'
              then (gr.usage #>> '{reasoning_tokens}')::bigint
          end,
          case
            when coalesce(gr.usage #>> '{output_tokens_details,reasoning_tokens}', '') ~ '^\d+$'
              then (gr.usage #>> '{output_tokens_details,reasoning_tokens}')::bigint
          end,
          case
            when coalesce(gr.usage #>> '{completion_tokens_details,reasoning_tokens}', '') ~ '^\d+$'
              then (gr.usage #>> '{completion_tokens_details,reasoning_tokens}')::bigint
          end,
          case
            when coalesce(gr.usage #>> '{output_details,reasoning_tokens}', '') ~ '^\d+$'
              then (gr.usage #>> '{output_details,reasoning_tokens}')::bigint
          end,
          0::bigint
        )
      ),
      0
    )::bigint as reasoning_tokens,
    now() as updated_at
  from public.gateway_requests gr
  where gr.team_id = p_team_id
    and gr.success is true
    and gr.created_at >= p_start
    and gr.created_at < p_end
  group by
    (gr.created_at at time zone 'UTC')::date,
    gr.team_id,
    coalesce(nullif(gr.model_id, ''), 'unknown/unknown'),
    coalesce(nullif(gr.endpoint, ''), 'unknown'),
    coalesce(nullif(gr.provider, ''), 'unknown');
end;
$$;
comment on function public.refresh_gateway_activity_rollup_daily(uuid, timestamptz, timestamptz) is
  'Recomputes per-team/day/model/endpoint/provider analytics buckets from gateway_requests for a bounded UTC range.';
grant execute on function public.refresh_gateway_activity_rollup_daily(uuid, timestamptz, timestamptz) to service_role;
