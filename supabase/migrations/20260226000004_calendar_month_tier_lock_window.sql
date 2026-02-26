-- Calendar-month tiering with enterprise lock window.
-- Rule:
-- - Hit $10k in any calendar month => Enterprise for that month and the following month.
-- - After the lock window, start counting low completed months.
-- - Downgrade after 3 consecutive completed months below $10k.

alter table public.teams
  add column if not exists enterprise_lock_through_month date null;

alter table public.teams
  add column if not exists tier_low_streak_evaluated_month date null;

create or replace function public.calculate_tier_with_grace(
  p_team_id uuid,
  p_spend_30d_nanos bigint
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stored_tier text;
  v_consecutive_low int;
  v_lock_through_month date;
  v_low_streak_evaluated_month date;

  v_threshold_nanos bigint := 10000000000000; -- $10k in nanos

  v_new_tier text;
  v_tier_changed boolean := false;
  v_reason text := null;

  v_now_utc timestamptz := (now() at time zone 'utc');
  v_current_month_start_ts timestamptz := date_trunc('month', v_now_utc);
  v_next_month_start_ts timestamptz := date_trunc('month', v_now_utc) + interval '1 month';
  v_last_completed_month_start_ts timestamptz := date_trunc('month', v_now_utc) - interval '1 month';

  v_current_month_start date := (date_trunc('month', v_now_utc))::date;
  v_last_completed_month_start date := (date_trunc('month', v_now_utc) - interval '1 month')::date;

  v_current_month_spend_nanos bigint := 0;
  v_eval_month_spend_nanos bigint := 0;

  v_effective_lock_through date;
  v_change_spend_nanos bigint := 0;
begin
  -- Lock row so concurrent requests cannot race tier counters.
  select
    coalesce(t.tier, 'basic'),
    coalesce(t.consecutive_low_spend_months, 0),
    t.enterprise_lock_through_month,
    t.tier_low_streak_evaluated_month
  into
    v_stored_tier,
    v_consecutive_low,
    v_lock_through_month,
    v_low_streak_evaluated_month
  from public.teams t
  where t.id = p_team_id
  for update;

  if v_stored_tier is null then
    return 'basic';
  end if;

  v_new_tier := v_stored_tier;
  v_effective_lock_through := v_lock_through_month;

  -- Source-of-truth qualification check: current calendar month spend.
  select coalesce(sum(gr.cost_nanos), 0)::bigint
  into v_current_month_spend_nanos
  from public.gateway_requests gr
  where gr.team_id = p_team_id
    and gr.success is true
    and gr.created_at >= v_current_month_start_ts
    and gr.created_at < v_next_month_start_ts;

  if v_current_month_spend_nanos >= v_threshold_nanos then
    -- Qualified this month: lock current + next month.
    v_new_tier := 'enterprise';
    v_consecutive_low := 0;
    v_effective_lock_through := (v_current_month_start + interval '1 month')::date;
    v_low_streak_evaluated_month := null;

    if v_stored_tier <> 'enterprise' then
      v_tier_changed := true;
      v_reason := format(
        'Calendar month spend $%s reached $10k threshold; enterprise locked through %s',
        round((v_current_month_spend_nanos::numeric / 1000000000.0)::numeric, 2),
        to_char(v_effective_lock_through, 'YYYY-MM')
      );
      v_change_spend_nanos := v_current_month_spend_nanos;
    end if;

  elsif v_stored_tier = 'enterprise' then
    -- Legacy enterprise teams without a lock window: protect current month once.
    if v_effective_lock_through is null then
      v_effective_lock_through := v_current_month_start;
    end if;

    -- During lock window (N and N+1), do not start low-month tracking.
    if v_current_month_start <= v_effective_lock_through then
      v_new_tier := 'enterprise';

    -- After lock window, only evaluate completed months after lock.
    elsif v_last_completed_month_start > v_effective_lock_through then
      if v_low_streak_evaluated_month is distinct from v_last_completed_month_start then
        select coalesce(sum(gr.cost_nanos), 0)::bigint
        into v_eval_month_spend_nanos
        from public.gateway_requests gr
        where gr.team_id = p_team_id
          and gr.success is true
          and gr.created_at >= v_last_completed_month_start_ts
          and gr.created_at < (v_last_completed_month_start_ts + interval '1 month');

        if v_eval_month_spend_nanos >= v_threshold_nanos then
          -- Re-qualified in a completed month: reset streak and lock that month + next.
          v_consecutive_low := 0;
          v_effective_lock_through := (v_last_completed_month_start + interval '1 month')::date;
        else
          v_consecutive_low := v_consecutive_low + 1;
        end if;

        v_low_streak_evaluated_month := v_last_completed_month_start;
      end if;

      if v_consecutive_low >= 3 then
        v_new_tier := 'basic';
        v_tier_changed := true;
        v_reason := format(
          '3 consecutive completed calendar months below $10k after enterprise lock window (latest %s)',
          to_char(v_last_completed_month_start, 'YYYY-MM')
        );
        v_change_spend_nanos := v_eval_month_spend_nanos;

        v_consecutive_low := 0;
        v_effective_lock_through := null;
        v_low_streak_evaluated_month := null;
      else
        v_new_tier := 'enterprise';
      end if;
    else
      v_new_tier := 'enterprise';
    end if;

  else
    -- Basic tier remains basic when not currently qualifying.
    v_new_tier := 'basic';
    v_consecutive_low := 0;
  end if;

  update public.teams
  set
    tier = v_new_tier,
    tier_updated_at = case when v_tier_changed then now() else tier_updated_at end,
    consecutive_low_spend_months = v_consecutive_low,
    enterprise_lock_through_month = v_effective_lock_through,
    tier_low_streak_evaluated_month = v_low_streak_evaluated_month
  where id = p_team_id;

  if v_tier_changed then
    insert into public.team_tier_history (
      team_id,
      old_tier,
      new_tier,
      reason,
      previous_month_spend_usd,
      threshold_usd,
      consecutive_low_months
    ) values (
      p_team_id,
      v_stored_tier,
      v_new_tier,
      v_reason,
      round((v_change_spend_nanos::numeric / 1000000000.0)::numeric, 2),
      10000.00,
      v_consecutive_low
    );
  end if;

  return v_new_tier;
end;
$$;

create or replace function public.cleanup_dormant_enterprise_teams()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
  v_result text;
  v_total_checked int := 0;
  v_updated_count int := 0;
  v_results jsonb[] := '{}';
  v_last_month_spend_nanos bigint := 0;
  v_prev_month_start_ts timestamptz := date_trunc('month', (now() at time zone 'utc')) - interval '1 month';
  v_current_month_start_ts timestamptz := date_trunc('month', (now() at time zone 'utc'));
begin
  for v_team_id in
    select t.id
    from public.teams t
    where coalesce(t.tier, 'basic') = 'enterprise'
    order by t.id
  loop
    v_total_checked := v_total_checked + 1;

    v_result := public.calculate_tier_with_grace(v_team_id, 0);

    if v_result = 'basic' then
      v_updated_count := v_updated_count + 1;

      select coalesce(sum(gr.cost_nanos), 0)::bigint
      into v_last_month_spend_nanos
      from public.gateway_requests gr
      where gr.team_id = v_team_id
        and gr.success is true
        and gr.created_at >= v_prev_month_start_ts
        and gr.created_at < v_current_month_start_ts;

      v_results := array_append(
        v_results,
        jsonb_build_object(
          'team_id', v_team_id,
          'old_tier', 'enterprise',
          'new_tier', 'basic',
          'spend_30d_usd', round((v_last_month_spend_nanos::numeric / 1000000000.0)::numeric, 2)
        )
      );
    end if;
  end loop;

  return jsonb_build_object(
    'total_teams_checked', v_total_checked,
    'teams_downgraded', v_updated_count,
    'downgraded_teams', to_jsonb(v_results),
    'processed_at', now()
  );
end;
$$;

create or replace function public.get_team_tier_info(p_team_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier text;
  v_tier_updated_at timestamptz;
  v_consecutive_low int;
  v_lock_through_month date;
  v_low_eval_month date;

  v_current_month_spend numeric(12, 2);
  v_prev_month_spend numeric(12, 2);
  v_threshold numeric(12, 2) := 10000.00;
  v_markup_pct numeric(4, 2);

  v_current_month_start_ts timestamptz := date_trunc('month', (now() at time zone 'utc'));
  v_prev_month_start_ts timestamptz := date_trunc('month', (now() at time zone 'utc')) - interval '1 month';
  v_next_month_start_ts timestamptz := date_trunc('month', (now() at time zone 'utc')) + interval '1 month';
  v_current_month_start date := (date_trunc('month', (now() at time zone 'utc')))::date;

  v_current_month_nanos bigint := 0;
  v_prev_month_nanos bigint := 0;

  v_current_month_index int;
  v_lock_month_index int;
  v_remaining_lock_months int := 0;
  v_months_until_downgrade int;
begin
  select
    coalesce(t.tier, 'basic'),
    t.tier_updated_at,
    coalesce(t.consecutive_low_spend_months, 0),
    t.enterprise_lock_through_month,
    t.tier_low_streak_evaluated_month
  into
    v_tier,
    v_tier_updated_at,
    v_consecutive_low,
    v_lock_through_month,
    v_low_eval_month
  from public.teams t
  where t.id = p_team_id;

  if v_tier is null then
    raise exception 'Team not found: %', p_team_id;
  end if;

  v_markup_pct := case when v_tier = 'enterprise' then 5.00 else 7.00 end;

  select coalesce(sum(gr.cost_nanos), 0)::bigint
  into v_current_month_nanos
  from public.gateway_requests gr
  where gr.team_id = p_team_id
    and gr.success is true
    and gr.created_at >= v_current_month_start_ts
    and gr.created_at < v_next_month_start_ts;

  select coalesce(sum(gr.cost_nanos), 0)::bigint
  into v_prev_month_nanos
  from public.gateway_requests gr
  where gr.team_id = p_team_id
    and gr.success is true
    and gr.created_at >= v_prev_month_start_ts
    and gr.created_at < v_current_month_start_ts;

  v_current_month_spend := round((v_current_month_nanos::numeric / 1000000000.0)::numeric, 2);
  v_prev_month_spend := round((v_prev_month_nanos::numeric / 1000000000.0)::numeric, 2);

  if v_lock_through_month is not null and v_current_month_start <= v_lock_through_month then
    v_current_month_index := extract(year from v_current_month_start)::int * 12 + extract(month from v_current_month_start)::int;
    v_lock_month_index := extract(year from v_lock_through_month)::int * 12 + extract(month from v_lock_through_month)::int;
    v_remaining_lock_months := (v_lock_month_index - v_current_month_index) + 1;
  else
    v_remaining_lock_months := 0;
  end if;

  if v_tier = 'enterprise' then
    if v_remaining_lock_months > 0 then
      v_months_until_downgrade := v_remaining_lock_months + 3;
    else
      v_months_until_downgrade := greatest(0, 3 - v_consecutive_low);
    end if;
  else
    v_months_until_downgrade := null;
  end if;

  return jsonb_build_object(
    'tier', v_tier,
    'tier_display', case when v_tier = 'enterprise' then 'Enterprise' else 'Basic' end,
    'markup_percentage', v_markup_pct,
    'tier_updated_at', v_tier_updated_at,
    'consecutive_low_spend_months', v_consecutive_low,
    'enterprise_lock_through_month', v_lock_through_month,
    'low_streak_evaluated_month', v_low_eval_month,
    'threshold_usd', v_threshold,
    'current_month_spend_usd', v_current_month_spend,
    'previous_month_spend_usd', v_prev_month_spend,
    'progress_to_enterprise_pct', least(100, round((v_current_month_spend / v_threshold * 100)::numeric, 1)),
    'is_eligible_for_enterprise', v_current_month_spend >= v_threshold,
    'months_until_downgrade', v_months_until_downgrade
  );
end;
$$;

grant execute on function public.calculate_tier_with_grace(uuid, bigint) to anon, authenticated, service_role;
grant execute on function public.cleanup_dormant_enterprise_teams() to service_role;
grant execute on function public.get_team_tier_info(uuid) to authenticated;

comment on function public.calculate_tier_with_grace(uuid, bigint)
  is 'Calendar-month tiering: immediate enterprise qualification at $10k current-month spend; lock current+next month; then 3 consecutive low completed months required for downgrade.';

comment on function public.cleanup_dormant_enterprise_teams()
  is 'Monthly cleanup for enterprise teams using the same calendar-month lock-window tier logic as request-time evaluation.';

comment on function public.get_team_tier_info(uuid)
  is 'Returns team tier status, calendar-month spend progress, lock window metadata, and downgrade runway.';
