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
  -- Which spend rules private.evaluate_workspace_spend_rules handles so far: spend and
  -- budget_percent over a calendar day, week or month, with an amount, workspace budget or key
  -- limit base. Forecast, spike, balance, rolling windows and previous_period bases are added
  -- by later changes, which widen this test so that the sweep's rollover pass and the
  -- evaluator stay in step.
  select p_metric in ('spend', 'budget_percent')
    and p_period in ('day', 'week', 'month')
    and (p_base_kind is null or p_base_kind in ('amount', 'workspace_budget', 'key_limit'));
$function$;

COMMENT ON FUNCTION "private"."spend_rule_evaluable"(text, text, text) IS 'True for the spend rules the evaluator handles: spend and budget_percent (amount, workspace_budget or key_limit base) over a calendar day, week or month.';

REVOKE ALL ON FUNCTION "private"."spend_rule_evaluable"(text, text, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."spend_rule_evaluable"(text, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_rule_evaluable"(text, text, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_rule_evaluable"(text, text, text) TO "service_role";
