CREATE OR REPLACE FUNCTION private.spend_balance_alert_text (
  p_rule_name              text,
  p_available_nanos        bigint,
  p_threshold_amount_nanos bigint,
  p_runway_days            integer,
  p_burn_per_day_nanos     numeric,
  p_runway_days_left       numeric,
  p_window_hours           integer,
  p_trigger                text
)
  RETURNS TABLE (
    title   text,
    message text
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- The text of a balance spend alert, in US money format. p_trigger: 'balance' when the balance
  -- is at or below the rule's amount, else 'runway' (days of credit left at or below runway_days).
  -- Used by private.evaluate_workspace_spend_rules and by public.preview_workspace_spend_rule for
  -- previews and test sends, so both read the same.
  with parts as (
    select
      case
        when p_window_hours % 24 = 0 and p_window_hours > 24 then (p_window_hours / 24) || ' days'
        when p_window_hours = 1 then 'hour'
        else p_window_hours || ' hours'
      end as window_text,
      case
        when p_runway_days_left is null then null
        when p_runway_days_left < 1 then 'less than a day'
        else 'about ' || to_char(p_runway_days_left, 'FM999,999,990.0') || ' days'
      end as runway_text
  )
  select
    left(p_rule_name, 100) || ': ' || case when p_trigger = 'balance'
        then 'balance at or below ' || private.workspace_push_usd(p_threshold_amount_nanos)
        else coalesce(parts.runway_text, 'little') || ' of credit left'
      end,
    'The workspace balance is ' || private.workspace_push_usd(greatest(p_available_nanos, 0))
      || case when p_trigger = 'balance'
        then ', at or below the ' || private.workspace_push_usd(p_threshold_amount_nanos) || ' alert threshold. '
        else '. '
      end
      || case when p_burn_per_day_nanos > 0
        then 'Spend over the last ' || parts.window_text || ' averages ' || private.workspace_push_usd(round(p_burn_per_day_nanos)::bigint)
          || ' a day, so it lasts ' || parts.runway_text
          || case when p_runway_days is not null then ' (alert at ' || p_runway_days || case when p_runway_days = 1 then ' day' else ' days' end || ')' else '' end
          || '. '
        else 'There was no spend in the last ' || parts.window_text || '. '
      end
      || 'Top up credits in Settings > Credits.'
  from parts;
$function$;

COMMENT ON FUNCTION "private"."spend_balance_alert_text"(text, bigint, bigint, integer, numeric, numeric, integer, text) IS 'Title and message of a balance spend alert (balance at or below an amount, or runway at or below a number of days). Shared by the evaluator and the API preview / test send.';

REVOKE ALL ON FUNCTION "private"."spend_balance_alert_text"(text, bigint, bigint, integer, numeric, numeric, integer, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."spend_balance_alert_text"(text, bigint, bigint, integer, numeric, numeric, integer, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_balance_alert_text"(text, bigint, bigint, integer, numeric, numeric, integer, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_balance_alert_text"(text, bigint, bigint, integer, numeric, numeric, integer, text) TO "service_role";
