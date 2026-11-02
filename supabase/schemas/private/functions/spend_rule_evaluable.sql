CREATE OR REPLACE FUNCTION private.spend_rule_evaluable (
  p_metric    text,
  p_period    text,
  p_base_kind text
)
  RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  -- Which spend rules private.evaluate_workspace_spend_rules handles so far:
  --   * spend, budget_percent and forecast over a calendar day, week or month, with an amount,
  --     workspace budget, key limit or previous-period base;
  --   * spend and budget_percent over a rolling window (window_hours), with an amount or
  --     previous-window base (cooldown_minutes between alerts);
  --   * balance rules (workspace scope, rolling: window_hours is the burn-rate lookback);
  --   * spike rules (rolling: window_hours is the spike window, compared with the median of the
  --     same window over the previous 7 days; private.spend_spike_rule_values).
  -- Every metric is evaluated now; this stays the one switch the sweep's passes and the
  -- evaluator share.
  select (p_metric in ('spend', 'budget_percent', 'forecast')
      and p_period in ('day', 'week', 'month')
      and (p_base_kind is null or p_base_kind in ('amount', 'workspace_budget', 'key_limit', 'previous_period')))
    or (p_metric in ('spend', 'budget_percent') and p_period = 'rolling' and (p_base_kind is null or p_base_kind in ('amount', 'previous_period')))
    or (p_metric in ('balance', 'spike') and p_period = 'rolling' and p_base_kind is null);
$function$;

COMMENT ON FUNCTION "private"."spend_rule_evaluable"(text, text, text) IS 'True for the spend rules the evaluator handles: spend, budget_percent and forecast over a calendar day, week or month (amount, workspace_budget, key_limit or previous_period base), spend and budget_percent over a rolling window (amount or previous_period base), balance rules (rolling burn-rate window) and spike rules (a rolling window against the median of the same window over the previous 7 days).';

REVOKE ALL ON FUNCTION "private"."spend_rule_evaluable"(text, text, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."spend_rule_evaluable"(text, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_rule_evaluable"(text, text, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_rule_evaluable"(text, text, text) TO "service_role";
