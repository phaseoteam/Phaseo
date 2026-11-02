CREATE OR REPLACE FUNCTION public.preview_workspace_spend_rule (
  p_workspace_id uuid,
  p_rule_id      uuid,
  p_now          timestamp with time zone DEFAULT now()
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Where a spend rule stands at p_now, computed as the evaluator computes it
-- (private.spend_rule_values) without writing anything: the current period, the value so far,
-- the base and percent, the highest threshold reached, the next threshold, the block point,
-- this period's state row, and the text an alert would carry now (private.spend_rule_alert_text,
-- naming the highest threshold reached, else the first). Used by the control API and web-api
-- preview and by test sends. Balance rules get the rolling burn window as period, the available
-- balance as value, a "balance" object (balance, reserved, available, burn and burn per day,
-- runway, which threshold holds, armed, whether auto top-up covers a drop) and the alert text
-- (private.spend_balance_rule_values / spend_balance_alert_text). Rolling spend and
-- budget_percent rules get their window as period (with window_hours) and their '-infinity'
-- state row. Forecast rules get a "forecast" object (ready, from, projected_nanos and
-- projected_percent, by = the period end, limit_nanos, reaches_at) and their thresholds are
-- measured against the projection; previous_period bases get "previous_period" {start, end}.
-- Spike rules get their window as period, spend over it as value, the median of the same window
-- over the previous 7 days as base_nanos (percent = value / median), the point they fire at as
-- next_threshold (while ready and not spiking), a "spike" object (window_hours, current, baseline,
-- multiple, multiplier, floor, fires_at, baseline_windows, active_windows, history_ready, spiking,
-- cooldown_until) and the alert text (private.spend_spike_rule_values / spend_spike_alert_text).
-- Every other metric gets "spike": null. evaluated is false for rules the evaluator does not
-- handle (private.spend_rule_evaluable). Errors: spend_rule_not_found (deleted, or another
-- workspace).
declare
  v_rule public.workspace_spend_rules;
  v_workspace_name text;
  v_time_zone text;
  v_evaluated boolean;
  v_value record;
  v_state record;
  v_reached integer;
  v_next integer;
  v_next_nanos numeric;
  v_block_nanos numeric;
  v_alert record;
  v_has_alert boolean := false;
  v_has_state boolean := false;
  v_balance record;
  v_has_balance boolean := false;
  v_measure numeric;
  v_spike record;
  v_has_spike boolean := false;
begin
  if p_workspace_id is null or p_rule_id is null or p_now is null then
    raise exception 'invalid_spend_rule_preview' using errcode = '22023';
  end if;

  select rule.* into v_rule
  from public.workspace_spend_rules rule
  where rule.id = p_rule_id and rule.workspace_id = p_workspace_id and rule.deleted_at is null;
  if not found then
    raise exception 'spend_rule_not_found' using errcode = 'P0002';
  end if;

  select w.name, coalesce(v_rule.time_zone, settings.billing_time_zone, 'UTC')
    into v_workspace_name, v_time_zone
  from public.workspaces w
  left join public.workspace_settings settings on settings.workspace_id = w.id
  where w.id = p_workspace_id;

  v_evaluated := private.spend_rule_evaluable(v_rule.metric, v_rule.period, v_rule.base_kind);

  if v_rule.metric = 'balance' then
    -- Balance rules: the available balance, the burn over the lookback window and the runway, as
    -- the evaluator sees them (private.spend_balance_rule_values), the armed state and the text.
    select computed.* into v_balance from private.spend_balance_rule_values(p_workspace_id, p_now, p_rule_id) computed;
    v_has_balance := found;
    select state.armed, state.amount_fired_at, state.last_fired_at, state.fire_count
      into v_state
    from public.workspace_spend_rule_state state
    where state.rule_id = v_rule.id and state.period_start = '-infinity'::timestamptz;
    v_has_state := found;
    if v_has_balance then
      -- The text an alert would carry now: the threshold that holds, else the balance amount if
      -- the rule has one, else the runway.
      select alert.* into v_alert
      from private.spend_balance_alert_text(
        v_rule.name, v_balance.available_nanos, v_rule.threshold_amount_nanos, v_rule.runway_days, v_balance.burn_per_day_nanos,
        v_balance.runway_days_left, v_rule.window_hours,
        case
          when v_balance.low_balance then 'balance'
          when v_balance.low_runway then 'runway'
          when v_rule.threshold_amount_nanos is not null then 'balance'
          else 'runway'
        end
      ) alert;
      v_has_alert := found;
    end if;
    return jsonb_build_object(
      'rule_id', v_rule.id,
      'metric', v_rule.metric,
      'evaluated', v_evaluated,
      'computed_at', p_now,
      'time_zone', v_time_zone,
      'period', case when v_rule.window_hours is not null then jsonb_build_object(
        'kind', 'rolling', 'start', p_now - make_interval(hours => v_rule.window_hours), 'end', p_now) end,
      'value_nanos', case when v_has_balance then v_balance.available_nanos end,
      'base_kind', null,
      'base_ref', null,
      'base_nanos', null,
      'percent', null,
      'threshold_percents', null,
      'threshold_amount_nanos', v_rule.threshold_amount_nanos,
      'reached_threshold_percent', null,
      'next_threshold', null,
      'block_at_nanos', null,
      'balance', case when v_has_balance then jsonb_build_object(
        'balance_nanos', v_balance.balance_nanos,
        'reserved_nanos', v_balance.reserved_nanos,
        'available_nanos', v_balance.available_nanos,
        'window_hours', v_rule.window_hours,
        'burn_nanos', round(v_balance.burn_nanos),
        'burn_per_day_nanos', round(v_balance.burn_per_day_nanos),
        'runway_days_left', v_balance.runway_days_left,
        'runway_days', v_rule.runway_days,
        'low_balance', v_balance.low_balance,
        'low_runway', v_balance.low_runway,
        'armed', coalesce(v_state.armed, true),
        'auto_top_up_covers', private.workspace_auto_top_up_covers(p_workspace_id)
      ) end,
      'state', case when v_has_state then jsonb_build_object(
        'highest_percent_fired', null,
        'amount_fired_at', v_state.amount_fired_at,
        'last_fired_at', v_state.last_fired_at,
        'fire_count', v_state.fire_count,
        'armed', v_state.armed
      ) end,
      'alert', case when v_has_alert then jsonb_build_object(
        'scope_label', coalesce(nullif(btrim(v_workspace_name), ''), 'Workspace'),
        'title', v_alert.title,
        'message', v_alert.message
      ) end
    );
  end if;

  if v_rule.metric = 'spike' then
    -- Spike rules: spend over the window, the median of the same window over the previous 7 days,
    -- the multiple and the point the rule fires at, as the evaluator sees them
    -- (private.spend_spike_rule_values), the cooldown state and the text.
    select computed.* into v_spike from private.spend_spike_rule_values(p_workspace_id, p_now, p_rule_id) computed;
    v_has_spike := found;
    select state.last_fired_at, state.fire_count into v_state
    from public.workspace_spend_rule_state state
    where state.rule_id = v_rule.id and state.period_start = '-infinity'::timestamptz;
    v_has_state := found;
    if v_has_spike and v_spike.baseline_windows >= 3 then
      select alert.* into v_alert
      from private.spend_spike_alert_text(
        v_workspace_name, v_rule.name, v_rule.scope_type, v_rule.scope_id, v_rule.scope_key_id, v_rule.scope_user_id,
        v_rule.scope_department_id, v_rule.window_hours, v_spike.current_nanos, v_spike.baseline_nanos, v_spike.multiple,
        v_rule.spike_multiplier, v_rule.spike_floor_nanos, v_spike.baseline_windows
      ) alert;
      v_has_alert := found;
    end if;
    return jsonb_build_object(
      'rule_id', v_rule.id,
      'metric', v_rule.metric,
      'evaluated', v_evaluated,
      'computed_at', p_now,
      'time_zone', v_time_zone,
      'period', case when v_has_spike then jsonb_build_object(
        'kind', 'rolling', 'start', v_spike.period_start, 'end', v_spike.period_end, 'window_hours', v_rule.window_hours) end,
      'value_nanos', case when v_has_spike then v_spike.current_nanos end,
      'base_kind', null,
      'base_ref', null,
      'base_nanos', case when v_has_spike then v_spike.baseline_nanos end,
      'previous_period', null,
      'forecast', null,
      'percent', case when v_spike.baseline_nanos > 0 then round(v_spike.current_nanos * 100 / v_spike.baseline_nanos, 1) end,
      'threshold_percents', null,
      'threshold_amount_nanos', null,
      'reached_threshold_percent', null,
      'next_threshold', case when v_has_spike and not v_spike.spiking and v_spike.history_ready then jsonb_build_object(
        'percent', null, 'amount_nanos', v_spike.fires_at_nanos) end,
      'block_at_nanos', null,
      'balance', null,
      'spike', case when v_has_spike then jsonb_build_object(
        'window_hours', v_rule.window_hours,
        'current_nanos', v_spike.current_nanos,
        'baseline_nanos', v_spike.baseline_nanos,
        'multiple', v_spike.multiple,
        'multiplier', v_rule.spike_multiplier,
        'floor_nanos', v_rule.spike_floor_nanos,
        'fires_at_nanos', v_spike.fires_at_nanos,
        'baseline_windows', v_spike.baseline_windows,
        'active_windows', v_spike.active_windows,
        'history_ready', v_spike.history_ready,
        'spiking', v_spike.spiking,
        'cooldown_until', case when v_state.last_fired_at + make_interval(mins => v_rule.cooldown_minutes) > p_now
          then v_state.last_fired_at + make_interval(mins => v_rule.cooldown_minutes) end
      ) end,
      'state', case when v_has_state then jsonb_build_object(
        'highest_percent_fired', null,
        'amount_fired_at', null,
        'last_fired_at', v_state.last_fired_at,
        'fire_count', v_state.fire_count
      ) end,
      'alert', case when v_has_alert then jsonb_build_object(
        'scope_label', v_alert.scope_label,
        'title', v_alert.title,
        'message', v_alert.message
      ) end
    );
  end if;

  select computed.* into v_value from private.spend_rule_values(p_workspace_id, p_now, p_rule_id) computed;
  if not found then
    return jsonb_build_object(
      'rule_id', v_rule.id,
      'metric', v_rule.metric,
      'evaluated', v_evaluated,
      'computed_at', p_now,
      'time_zone', v_time_zone,
      'period', null,
      'value_nanos', null,
      'base_kind', v_rule.base_kind,
      'base_ref', v_rule.base_ref,
      'base_nanos', null,
      'previous_period', null,
      'forecast', null,
      'percent', null,
      'threshold_percents', to_jsonb(v_rule.threshold_percents),
      'threshold_amount_nanos', v_rule.threshold_amount_nanos,
      'reached_threshold_percent', null,
      'next_threshold', null,
      'block_at_nanos', null,
      'state', null,
      'alert', null
    );
  end if;

  select state.highest_percent_fired, state.amount_fired_at, state.last_fired_at, state.fire_count
    into v_state
  from public.workspace_spend_rule_state state
  where state.rule_id = v_rule.id
    and state.period_start = case when v_rule.period = 'rolling' then '-infinity'::timestamptz else v_value.period_start end;
  v_has_state := found;

  -- What thresholds are measured against: spend so far, or a forecast's projection (none until
  -- the projection is ready).
  v_measure := case when v_rule.metric = 'forecast' then v_value.projected_nanos else v_value.value_nanos end;

  if v_rule.metric in ('budget_percent', 'forecast') and v_value.base_nanos > 0 and v_rule.threshold_percents is not null then
    if v_measure is not null then
      select
        max(threshold) filter (where v_measure * 100 >= threshold::numeric * v_value.base_nanos),
        min(threshold) filter (where v_measure * 100 < threshold::numeric * v_value.base_nanos)
        into v_reached, v_next
      from unnest(v_rule.threshold_percents) threshold;
    else
      v_next := v_rule.threshold_percents[1];
    end if;
    v_next_nanos := ceil(v_next::numeric * v_value.base_nanos / 100);
  elsif v_rule.threshold_amount_nanos is not null and (v_measure is null or v_measure < v_rule.threshold_amount_nanos) then
    v_next_nanos := v_rule.threshold_amount_nanos;
  end if;

  if v_rule.action = 'block' then
    v_block_nanos := case
      when v_rule.metric = 'spend' then v_rule.block_at_amount_nanos
      when v_value.base_nanos > 0 then ceil(v_rule.block_at_percent::numeric * v_value.base_nanos / 100)
    end;
  end if;

  if v_rule.metric = 'spend'
    or (v_rule.metric = 'budget_percent' and v_value.base_nanos > 0)
    or (v_rule.metric = 'forecast' and v_value.projected_nanos is not null
      and (v_rule.threshold_amount_nanos is not null or v_value.base_nanos > 0)) then
    select alert.* into v_alert
    from private.spend_rule_alert_text(
      v_workspace_name, v_rule.name, v_rule.metric, v_rule.scope_type, v_rule.scope_id, v_rule.scope_key_id,
      v_rule.scope_user_id, v_rule.scope_department_id, v_rule.period, v_value.period_end, v_value.time_zone,
      v_rule.base_kind, v_rule.base_ref, v_value.base_nanos, v_rule.threshold_percents, v_rule.threshold_amount_nanos,
      v_value.value_nanos, coalesce(v_reached, v_rule.threshold_percents[1]), v_rule.window_hours, v_value.projected_nanos,
      v_value.reaches_at
    ) alert;
    v_has_alert := found;
  end if;

  return jsonb_build_object(
    'rule_id', v_rule.id,
    'metric', v_rule.metric,
    'evaluated', v_evaluated,
    'computed_at', p_now,
    'time_zone', v_value.time_zone,
    'period', jsonb_strip_nulls(jsonb_build_object('kind', v_rule.period, 'start', v_value.period_start, 'end', v_value.period_end,
      'window_hours', v_value.window_hours)),
    'value_nanos', v_value.value_nanos,
    'base_kind', v_rule.base_kind,
    'base_ref', v_rule.base_ref,
    'base_nanos', v_value.base_nanos,
    'previous_period', case when v_value.previous_start is not null then jsonb_build_object(
      'start', v_value.previous_start, 'end', v_value.previous_end) end,
    'forecast', case when v_rule.metric = 'forecast' then jsonb_build_object(
      'ready', v_value.projected_nanos is not null,
      'from', v_value.forecast_from,
      'projected_nanos', v_value.projected_nanos,
      'projected_percent', case when v_value.base_nanos > 0 and v_value.projected_nanos is not null
        then round(v_value.projected_nanos * 100 / v_value.base_nanos, 1) end,
      'by', v_value.period_end,
      'limit_nanos', v_value.limit_nanos,
      'reaches_at', v_value.reaches_at
    ) end,
    'percent', case when v_value.base_nanos > 0 then round(v_value.value_nanos * 100 / v_value.base_nanos, 1) end,
    'threshold_percents', to_jsonb(v_rule.threshold_percents),
    'threshold_amount_nanos', v_rule.threshold_amount_nanos,
    'reached_threshold_percent', v_reached,
    'next_threshold', case when v_next_nanos is not null then jsonb_build_object('percent', v_next, 'amount_nanos', v_next_nanos) end,
    'block_at_nanos', v_block_nanos,
    'state', case when v_has_state then jsonb_build_object(
      'highest_percent_fired', v_state.highest_percent_fired,
      'amount_fired_at', v_state.amount_fired_at,
      'last_fired_at', v_state.last_fired_at,
      'fire_count', v_state.fire_count
    ) end,
    'alert', case when v_has_alert then jsonb_build_object(
      'scope_label', v_alert.scope_label,
      'title', v_alert.title,
      'message', v_alert.message
    ) end
  );
end;
$function$;

COMMENT ON FUNCTION "public"."preview_workspace_spend_rule"(uuid, uuid, timestamp with time zone) IS 'Read-only preview of a spend rule at p_now: period, value, base, percent, thresholds reached and next, block point, state and the alert text, computed by the evaluator''s own functions. Service role only (control API and web-api).';

REVOKE ALL ON FUNCTION "public"."preview_workspace_spend_rule"(uuid, uuid, timestamp with time zone) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."preview_workspace_spend_rule"(uuid, uuid, timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."preview_workspace_spend_rule"(uuid, uuid, timestamp with time zone) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."preview_workspace_spend_rule"(uuid, uuid, timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."preview_workspace_spend_rule"(uuid, uuid, timestamp with time zone) FROM "anon", "authenticated";
