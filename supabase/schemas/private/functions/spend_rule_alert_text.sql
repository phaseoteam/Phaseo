CREATE OR REPLACE FUNCTION private.spend_rule_alert_text (
  p_workspace_name         text,
  p_rule_name              text,
  p_metric                 text,
  p_scope_type             text,
  p_scope_id               text,
  p_scope_key_id           uuid,
  p_scope_user_id          uuid,
  p_scope_department_id    uuid,
  p_period                 text,
  p_period_end             timestamp with time zone,
  p_time_zone              text,
  p_base_kind              text,
  p_base_ref               text,
  p_base_nanos             bigint,
  p_threshold_percents     integer[],
  p_threshold_amount_nanos bigint,
  p_value_nanos            numeric,
  p_threshold_percent      integer,
  p_window_hours           integer,
  p_projected_nanos        numeric,
  p_reaches_at             timestamp with time zone
)
  RETURNS TABLE (
    scope_label text,
    title       text,
    message     text
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- The text of a spend alert (spend, budget_percent and forecast rules over a calendar period or
  -- a rolling window): the scope's label, the title and the message, in US money format with
  -- times in the rule's zone. Used by private.evaluate_workspace_spend_rules for real alerts and
  -- by public.preview_workspace_spend_rule for previews and test sends, so both read the same.
  --   p_threshold_percent: the threshold the alert names (budget_percent, forecast by percent).
  --   p_window_hours: a rolling rule's window.
  --   p_projected_nanos / p_reaches_at: a forecast's projected period total, and when the pace
  --   so far reaches the limit (the amount threshold, else the base), if it does this period.
  with label as (
    select case p_scope_type
      when 'workspace' then nullif(btrim(p_workspace_name), '')
      when 'key' then (select nullif(btrim(key.name), '') from public.keys key where key.id = p_scope_key_id)
      when 'member' then (select nullif(btrim(member.email), '') from auth.users member where member.id = p_scope_user_id)
      when 'department' then (
        select nullif(btrim(department.name), '') from public.workspace_departments department
        where department.id = p_scope_department_id
      )
      when 'model' then (select nullif(btrim(model.name), '') from public.v2_models model where model.model_slug = p_scope_id limit 1)
    end as label
  ),
  parts as (
    select
      coalesce(label.label, p_scope_id, p_workspace_name, 'Workspace') as scope_label,
      case p_scope_type
        when 'workspace' then 'The workspace'
        when 'key' then 'API key ''' || coalesce(left(label.label, 60), 'deleted key') || ''''
        when 'member' then coalesce(label.label, 'A former member')
        when 'department' then 'Department ''' || coalesce(left(label.label, 60), 'deleted department') || ''''
        when 'model' then coalesce(label.label, p_scope_id)
        else 'Provider ' || p_scope_id
      end as subject,
      case p_base_kind
        when 'workspace_budget' then 'the ' || p_base_ref || ' budget'
        when 'key_limit' then 'the key''s ' || p_base_ref || ' limit'
        when 'previous_period' then case
          when p_period = 'rolling' then 'the ' || case when p_window_hours = 1 then 'hour' else p_window_hours || ' hours' end || ' before'
          when p_metric = 'forecast' then case p_period when 'day' then 'yesterday''s total' else 'last ' || p_period || '''s total' end
          else case p_period when 'day' then 'yesterday at this time' else 'the same point last ' || p_period end
        end
        else private.workspace_push_usd(p_base_nanos)
      end as base_short,
      case p_period
        when 'day' then 'today'
        when 'week' then 'this week'
        when 'month' then 'this month'
        else 'in the last ' || case when p_window_hours = 1 then 'hour' else p_window_hours || ' hours' end
      end as so_far,
      case when p_period = 'rolling' then ''
        else ' The ' || p_period || ' resets ' || to_char(p_period_end at time zone p_time_zone, 'Mon FMDD, HH24:MI') || ' ' || p_time_zone || '.'
      end as resets,
      to_char(p_period_end at time zone p_time_zone, 'Mon FMDD, HH24:MI') || ' ' || p_time_zone as period_end_text,
      to_char(p_reaches_at at time zone p_time_zone, 'Mon FMDD, HH24:MI') as reaches_text
    from label
  ),
  texts as (
    select parts.*,
      case p_base_kind
        when 'amount' then private.workspace_push_usd(p_base_nanos)
        else parts.base_short || ' (' || private.workspace_push_usd(p_base_nanos) || ')'
      end as base_long,
      'Alerts at ' || (select string_agg(threshold || '%', ', ' order by threshold) from unnest(p_threshold_percents) threshold) || '.' as alerts_at,
      -- The forecast's limit: the amount threshold, else the base.
      case when p_threshold_amount_nanos is not null then private.workspace_push_usd(p_threshold_amount_nanos) end as limit_amount
    from parts
  )
  select
    texts.scope_label,
    left(p_rule_name, 100) || ': ' || case
        when p_metric = 'spend' then private.workspace_push_usd(p_threshold_amount_nanos) || ' reached'
        when p_metric = 'forecast' and p_threshold_amount_nanos is not null
          then 'projected to reach ' || private.workspace_push_usd(p_projected_nanos) || ' ' || texts.so_far
        when p_metric = 'forecast' then 'projected to pass ' || p_threshold_percent || '% of ' || texts.base_short
        else p_threshold_percent || '% of ' || texts.base_short || ' reached'
      end,
    case
      when p_metric = 'forecast' then
        texts.subject || ' has spent ' || private.workspace_push_usd(p_value_nanos) || ' ' || texts.so_far
          || ' and is projected to reach ' || private.workspace_push_usd(p_projected_nanos) || ' by ' || texts.period_end_text
          || case
            when p_threshold_amount_nanos is not null then ', past the ' || texts.limit_amount || ' alert threshold.'
            else ': ' || to_char(floor(p_projected_nanos * 100 / p_base_nanos), 'FM999,999,990') || '% of ' || texts.base_long || '. ' || texts.alerts_at
          end
          || case
            when p_reaches_at is not null then ' At this pace it reaches '
              || coalesce(texts.limit_amount, texts.base_long) || ' on ' || texts.reaches_text || '.'
            when p_value_nanos >= coalesce(p_threshold_amount_nanos, p_base_nanos) then ' It has already passed '
              || coalesce(texts.limit_amount, texts.base_long) || '.'
            else ''
          end
      else
        texts.subject || ' has spent ' || private.workspace_push_usd(p_value_nanos) || ' ' || texts.so_far
          || case when p_metric = 'spend'
            then ', past the ' || private.workspace_push_usd(p_threshold_amount_nanos) || ' alert threshold.'
            else ': ' || to_char(floor(p_value_nanos * 100 / p_base_nanos), 'FM999,999,990') || '% of ' || texts.base_long || '. ' || texts.alerts_at
          end
          || texts.resets
    end
  from texts;
$function$;

COMMENT ON FUNCTION "private"."spend_rule_alert_text"(text, text, text, text, text, uuid, uuid, uuid, text, timestamp with time zone, text, text, text, bigint, integer[], bigint, numeric, integer, integer, numeric, timestamp with time zone) IS 'Scope label, title and message of a spend alert for a spend, budget_percent or forecast rule over a calendar period or rolling window. Shared by the evaluator and the API preview / test send.';

REVOKE ALL ON FUNCTION "private"."spend_rule_alert_text"(text, text, text, text, text, uuid, uuid, uuid, text, timestamp with time zone, text, text, text, bigint, integer[], bigint, numeric, integer, integer, numeric, timestamp with time zone) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."spend_rule_alert_text"(text, text, text, text, text, uuid, uuid, uuid, text, timestamp with time zone, text, text, text, bigint, integer[], bigint, numeric, integer, integer, numeric, timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_rule_alert_text"(text, text, text, text, text, uuid, uuid, uuid, text, timestamp with time zone, text, text, text, bigint, integer[], bigint, numeric, integer, integer, numeric, timestamp with time zone) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_rule_alert_text"(text, text, text, text, text, uuid, uuid, uuid, text, timestamp with time zone, text, text, text, bigint, integer[], bigint, numeric, integer, integer, numeric, timestamp with time zone) TO "service_role";
