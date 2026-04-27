-- ============================================================================
-- SINGLE-TIER WORKSPACE PRICING COMPATIBILITY SCRIPT
-- Purpose: Keep legacy tier-shaped RPCs stable while enforcing the flat 5% plan
-- Current behavior:
-- - All workspaces resolve to the standard plan
-- - Legacy tier value remains "basic" for compatibility
-- - UI/display markup percentage is always 5.00
-- ============================================================================

alter table public.workspaces
  add column if not exists tier text default 'basic';

alter table public.workspaces
  add column if not exists tier_updated_at timestamptz default now();

alter table public.workspaces
  add column if not exists consecutive_low_spend_months integer default 0;

alter table public.workspaces
  add column if not exists enterprise_lock_through_month date null;

alter table public.workspaces
  add column if not exists tier_low_streak_evaluated_month date null;

update public.workspaces
set
  tier = 'basic',
  tier_updated_at = now(),
  consecutive_low_spend_months = 0,
  enterprise_lock_through_month = null,
  tier_low_streak_evaluated_month = null
where
  tier is null
  or tier <> 'basic'
  or tier_updated_at is null
  or consecutive_low_spend_months is null
  or consecutive_low_spend_months <> 0
  or enterprise_lock_through_month is not null
  or tier_low_streak_evaluated_month is not null;

drop function if exists public.calculate_tier_with_grace(uuid, bigint);
drop function if exists public.cleanup_dormant_enterprise_workspaces();
drop function if exists public.get_workspace_tier_info(uuid);

create or replace function public.calculate_tier_with_grace(
  p_workspace_id uuid,
  p_spend_30d_nanos bigint
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.workspaces
  set
    tier = 'basic',
    tier_updated_at = coalesce(tier_updated_at, now()),
    consecutive_low_spend_months = 0,
    enterprise_lock_through_month = null,
    tier_low_streak_evaluated_month = null
  where id = p_workspace_id;

  perform p_spend_30d_nanos;
  return 'basic';
end;
$$;

create or replace function public.cleanup_dormant_enterprise_workspaces()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return jsonb_build_object(
    'total_teams_checked', 0,
    'teams_downgraded', 0,
    'downgraded_teams', '[]'::jsonb,
    'processed_at', now()
  );
end;
$$;

create or replace function public.get_workspace_tier_info(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exists boolean := false;
  v_tier_updated_at timestamptz;
  v_current_month_nanos bigint := 0;
  v_prev_month_nanos bigint := 0;
  v_current_month_spend numeric(12, 2);
  v_prev_month_spend numeric(12, 2);
  v_current_month_start_ts timestamptz := (date_trunc('month', now() at time zone 'UTC') at time zone 'UTC');
  v_prev_month_start_ts timestamptz := ((date_trunc('month', now() at time zone 'UTC') - interval '1 month') at time zone 'UTC');
  v_next_month_start_ts timestamptz := ((date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC');
begin
  select exists(
    select 1 from public.workspaces w where w.id = p_workspace_id
  )
  into v_exists;

  if not v_exists then
    raise exception 'Workspace not found: %', p_workspace_id;
  end if;

  select coalesce(w.tier_updated_at, now())
  into v_tier_updated_at
  from public.workspaces w
  where w.id = p_workspace_id;

  select coalesce(sum(gr.cost_nanos), 0)::bigint
  into v_current_month_nanos
  from public.gateway_requests gr
  where gr.workspace_id = p_workspace_id
    and gr.success is true
    and gr.created_at >= v_current_month_start_ts
    and gr.created_at < v_next_month_start_ts;

  select coalesce(sum(gr.cost_nanos), 0)::bigint
  into v_prev_month_nanos
  from public.gateway_requests gr
  where gr.workspace_id = p_workspace_id
    and gr.success is true
    and gr.created_at >= v_prev_month_start_ts
    and gr.created_at < v_current_month_start_ts;

  v_current_month_spend := round((v_current_month_nanos::numeric / 1000000000.0)::numeric, 2);
  v_prev_month_spend := round((v_prev_month_nanos::numeric / 1000000000.0)::numeric, 2);

  return jsonb_build_object(
    'tier', 'basic',
    'tier_display', 'Standard',
    'markup_percentage', 5.00,
    'tier_updated_at', v_tier_updated_at,
    'consecutive_low_spend_months', 0,
    'enterprise_lock_through_month', null,
    'low_streak_evaluated_month', null,
    'threshold_usd', 0,
    'current_month_spend_usd', v_current_month_spend,
    'previous_month_spend_usd', v_prev_month_spend,
    'progress_to_enterprise_pct', 100,
    'is_eligible_for_enterprise', false,
    'months_until_downgrade', null
  );
end;
$$;

grant execute on function public.calculate_tier_with_grace(uuid, bigint) to service_role;
grant execute on function public.cleanup_dormant_enterprise_workspaces() to service_role;
grant execute on function public.get_workspace_tier_info(uuid) to service_role;

comment on function public.calculate_tier_with_grace(uuid, bigint)
  is 'Compatibility shim for workspace tier calculation. Flat single-tier pricing always resolves to the standard 5% plan.';

comment on function public.cleanup_dormant_enterprise_workspaces()
  is 'Compatibility shim retained after single-tier pricing rollout. Returns no-op cleanup results.';

comment on function public.get_workspace_tier_info(uuid)
  is 'Returns workspace pricing metadata for the flat standard plan, including 5% markup and spend summaries.';
