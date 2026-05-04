-- Single-tier workspace pricing rollout.
-- - Normalizes all workspaces to one "basic"/standard tier at 5%.
-- - Removes tier-gated invoice-run selection.
-- - Keeps existing function names for compatibility while returning flat-tier behavior.

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
  coalesce(tier, 'basic') <> 'basic'
  or coalesce(consecutive_low_spend_months, 0) <> 0
  or enterprise_lock_through_month is not null
  or tier_low_streak_evaluated_month is not null;
-- Recreate helper functions with stable signatures.
drop function if exists public.calculate_tier_with_grace(uuid, bigint);
drop function if exists public.cleanup_dormant_enterprise_workspaces();
drop function if exists public.get_workspace_tier_info(uuid);
drop function if exists public.get_due_enterprise_invoice_runs(timestamptz);
create or replace function public.calculate_tier_with_grace(
  p_workspace_id uuid,
  p_spend_30d_nanos bigint
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier text;
  v_consecutive_low int := 0;
  v_lock_through_month date := null;
  v_low_eval_month date := null;
begin
  -- Single-plan model: tiering is disabled and all workspaces resolve to basic/standard.
  select
    coalesce(t.tier, 'basic'),
    coalesce(t.consecutive_low_spend_months, 0),
    t.enterprise_lock_through_month,
    t.tier_low_streak_evaluated_month
  into
    v_tier,
    v_consecutive_low,
    v_lock_through_month,
    v_low_eval_month
  from public.workspaces t
  where t.id = p_workspace_id
  for update;

  if v_tier is null then
    return 'basic';
  end if;

  if
    v_tier <> 'basic'
    or v_consecutive_low <> 0
    or v_lock_through_month is not null
    or v_low_eval_month is not null
  then
    update public.workspaces
    set
      tier = 'basic',
      tier_updated_at = now(),
      consecutive_low_spend_months = 0,
      enterprise_lock_through_month = null,
      tier_low_streak_evaluated_month = null
    where id = p_workspace_id;
  end if;

  -- Keep signature compatibility; argument intentionally unused.
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
  v_current_month_start_ts timestamptz := date_trunc('month', (now() at time zone 'utc'));
  v_prev_month_start_ts timestamptz := date_trunc('month', (now() at time zone 'utc')) - interval '1 month';
  v_next_month_start_ts timestamptz := date_trunc('month', (now() at time zone 'utc')) + interval '1 month';
begin
  select true, t.tier_updated_at
  into v_exists, v_tier_updated_at
  from public.workspaces t
  where t.id = p_workspace_id;

  if not v_exists then
    raise exception 'Workspace not found: %', p_workspace_id;
  end if;

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
create or replace function public.get_due_enterprise_invoice_runs(
  p_run_at timestamptz default (now() at time zone 'utc')
)
returns table (
  workspace_id uuid,
  stripe_customer_id text,
  billing_day integer,
  payment_terms_days integer,
  period_start timestamptz,
  period_end timestamptz,
  amount_nanos bigint
)
language sql
security definer
set search_path = public
as $$
with params as (
  select (p_run_at at time zone 'utc')::timestamptz as run_at
),
due_profiles as (
  select
    p.workspace_id,
    p.billing_day,
    p.payment_terms_days,
    w.stripe_customer_id
  from public.workspace_invoice_profiles p
  join public.workspaces t
    on t.id = p.workspace_id
  left join public.wallets w
    on w.workspace_id = p.workspace_id
  cross join params pa
  where p.enabled = true
    and p.billing_day = extract(day from pa.run_at)::int
    and coalesce(t.billing_mode, 'wallet') = 'invoice'
    and w.stripe_customer_id is not null
),
windows as (
  select
    d.*,
    pa.run_at,
    make_timestamptz(
      extract(year from pa.run_at)::int,
      extract(month from pa.run_at)::int,
      d.billing_day,
      0, 0, 0,
      'UTC'
    ) as this_cycle_end
  from due_profiles d
  cross join params pa
),
periods as (
  select
    w.workspace_id,
    w.stripe_customer_id,
    w.billing_day,
    w.payment_terms_days,
    case
      when w.run_at < w.this_cycle_end
        then w.this_cycle_end - interval '1 month'
      else w.this_cycle_end
    end as period_start,
    case
      when w.run_at < w.this_cycle_end
        then w.this_cycle_end
      else w.this_cycle_end + interval '1 month'
    end as period_end
  from windows w
),
aggregated as (
  select
    p.workspace_id,
    p.stripe_customer_id,
    p.billing_day,
    p.payment_terms_days,
    p.period_start,
    p.period_end,
    coalesce(sum(gr.cost_nanos), 0)::bigint as amount_nanos
  from periods p
  left join public.gateway_requests gr
    on gr.workspace_id = p.workspace_id
   and gr.success is true
   and gr.created_at >= p.period_start
   and gr.created_at < p.period_end
  group by
    p.workspace_id,
    p.stripe_customer_id,
    p.billing_day,
    p.payment_terms_days,
    p.period_start,
    p.period_end
)
select
  a.workspace_id,
  a.stripe_customer_id,
  a.billing_day,
  a.payment_terms_days,
  a.period_start,
  a.period_end,
  a.amount_nanos
from aggregated a
where not exists (
  select 1
  from public.workspace_invoices i
  where i.workspace_id = a.workspace_id
    and i.period_start = a.period_start
    and i.period_end = a.period_end
);
$$;
create or replace function public.enforce_workspace_invoice_onboarding_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Invoice onboarding is no longer invite-gated.
  if new.billing_mode = 'invoice'
     and coalesce(new.invoice_onboarding_status, 'none') <> 'completed' then
    new.invoice_onboarding_status := 'completed';
  end if;

  return new;
end;
$$;
comment on function public.calculate_tier_with_grace(uuid, bigint)
  is 'Single-tier mode: always resolves to basic/standard tier with a flat 5% pricing fee.';
comment on function public.cleanup_dormant_enterprise_workspaces()
  is 'Single-tier mode no-op retained for backwards compatibility.';
comment on function public.get_workspace_tier_info(uuid)
  is 'Single-tier workspace pricing info with a flat 5% markup.';
