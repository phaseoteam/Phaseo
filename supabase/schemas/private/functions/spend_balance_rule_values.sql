CREATE OR REPLACE FUNCTION private.spend_balance_rule_values (
  p_workspace_id uuid,
  p_now          timestamp with time zone,
  p_rule_id      uuid DEFAULT NULL::uuid
)
  RETURNS TABLE (
    id                     uuid,
    name                   text,
    action                 text,
    window_hours           integer,
    threshold_amount_nanos bigint,
    runway_days            integer,
    cooldown_minutes       integer,
    balance_nanos          bigint,
    reserved_nanos         bigint,
    available_nanos        bigint,
    burn_nanos             numeric,
    burn_per_day_nanos     numeric,
    runway_days_left       numeric,
    low_balance            boolean,
    low_runway             boolean
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- Where balance spend rules stand at p_now: the one definition the evaluator
  -- (private.evaluate_workspace_spend_rules) and the API preview (public.preview_workspace_spend_rule)
  -- share.
  --   * Without p_rule_id: the workspace's enabled, non-deleted balance rules that
  --     private.spend_rule_evaluable accepts. With p_rule_id: that balance rule if it is not deleted.
  --   * Balance: what the gateway admits requests against, balance_nanos - reserved_nanos (at
  --     least 0). No wallet: no values, so the rule does not fire.
  --   * Burn: spend over the rule's window_hours before p_now, as the other rules count spend
  --     (v2_private_usage_15m plus successful async jobs and realtime sessions from
  --     gateway_requests), scaled to a day. Runway: available / burn per day; none without spend.
  --   * low_balance: available at or below threshold_amount_nanos. low_runway: runway at or below
  --     runway_days.
  with rules as materialized (
    select rule.id, rule.name, rule.action, rule.window_hours, rule.threshold_amount_nanos, rule.runway_days, rule.cooldown_minutes
    from public.workspace_spend_rules rule
    where rule.workspace_id = p_workspace_id
      and rule.deleted_at is null
      and rule.metric = 'balance'
      and rule.window_hours is not null
      and case
        when p_rule_id is null then rule.enabled and private.spend_rule_evaluable(rule.metric, rule.period, rule.base_kind)
        else rule.id = p_rule_id
      end
  ),
  wallet as (
    select w.balance_nanos, w.reserved_nanos, greatest(w.balance_nanos - coalesce(w.reserved_nanos, 0), 0) as available_nanos
    from public.wallets w
    where w.workspace_id = p_workspace_id
  ),
  burned as (
    select rules.*, (
        select coalesce(sum(rollup.cost_nanos), 0)
        from public.v2_private_usage_15m rollup
        where rollup.workspace_id = p_workspace_id
          and rollup.bucket_start >= p_now - make_interval(hours => rules.window_hours)
          and rollup.bucket_start < p_now
      ) + (
        -- gateway_requests_async_spend_idx
        select coalesce(sum(request.cost_nanos), 0)
        from public.gateway_requests request
        where request.success is true
          and request.endpoint = any (array['video.generation', 'batch', 'music.generate', 'audio.realtime'])
          and request.workspace_id = p_workspace_id
          and request.created_at >= p_now - make_interval(hours => rules.window_hours)
          and request.created_at < p_now
      ) as burn_nanos
    from rules
  )
  select burned.id, burned.name, burned.action, burned.window_hours, burned.threshold_amount_nanos, burned.runway_days,
    burned.cooldown_minutes, wallet.balance_nanos, wallet.reserved_nanos, wallet.available_nanos, burned.burn_nanos,
    per_day.burn_per_day_nanos,
    case when per_day.burn_per_day_nanos > 0 then round(wallet.available_nanos / per_day.burn_per_day_nanos, 2) end,
    burned.threshold_amount_nanos is not null and wallet.available_nanos <= burned.threshold_amount_nanos,
    burned.runway_days is not null and per_day.burn_per_day_nanos > 0
      and wallet.available_nanos <= burned.runway_days * per_day.burn_per_day_nanos
  from burned
  cross join wallet
  cross join lateral (select burned.burn_nanos * 24 / burned.window_hours as burn_per_day_nanos) per_day;
$function$;

COMMENT ON FUNCTION "private"."spend_balance_rule_values"(uuid, timestamp with time zone, uuid) IS 'Available balance (balance - reserved), burn over the rule''s window_hours (rollup plus async jobs), burn per day and runway of balance spend rules at p_now, and whether each is at or below its balance or runway threshold. Shared by the evaluator and the API preview.';

REVOKE ALL ON FUNCTION "private"."spend_balance_rule_values"(uuid, timestamp with time zone, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."spend_balance_rule_values"(uuid, timestamp with time zone, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_balance_rule_values"(uuid, timestamp with time zone, uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_balance_rule_values"(uuid, timestamp with time zone, uuid) TO "service_role";
