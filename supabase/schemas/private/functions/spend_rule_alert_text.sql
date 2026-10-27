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
  p_threshold_percent      integer
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
  -- The text of a spend alert (calendar spend and budget_percent rules): the scope's label, the
  -- title and the message, in US money format with the reset time in the rule's zone. Used by
  -- private.evaluate_workspace_spend_rules for real alerts and by
  -- public.preview_workspace_spend_rule for previews and test sends, so both read the same.
  --   p_threshold_percent: the threshold the alert names (budget_percent).
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
        else private.workspace_push_usd(p_base_nanos)
      end as base_short,
      case p_period when 'day' then 'today' when 'week' then 'this week' else 'this month' end as so_far,
      'The ' || case p_period when 'day' then 'day' when 'week' then 'week' else 'month' end || ' resets '
        || to_char(p_period_end at time zone p_time_zone, 'Mon FMDD, HH24:MI') || ' ' || p_time_zone || '.' as resets
    from label
  )
  select
    parts.scope_label,
    left(p_rule_name, 100) || ': ' || case when p_metric = 'spend'
        then private.workspace_push_usd(p_threshold_amount_nanos) || ' reached'
        else p_threshold_percent || '% of ' || parts.base_short || ' reached'
      end,
    parts.subject || ' has spent ' || private.workspace_push_usd(p_value_nanos) || ' ' || parts.so_far
      || case when p_metric = 'spend'
        then ', past the ' || private.workspace_push_usd(p_threshold_amount_nanos) || ' alert threshold. '
        else ': ' || to_char(floor(p_value_nanos * 100 / p_base_nanos), 'FM999,999,990') || '% of '
          || case p_base_kind
            when 'amount' then private.workspace_push_usd(p_base_nanos)
            else parts.base_short || ' (' || private.workspace_push_usd(p_base_nanos) || ')'
          end
          || '. Alerts at ' || (select string_agg(threshold || '%', ', ' order by threshold) from unnest(p_threshold_percents) threshold) || '. '
      end
      || parts.resets
  from parts;
$function$;

COMMENT ON FUNCTION "private"."spend_rule_alert_text"(text, text, text, text, text, uuid, uuid, uuid, text, timestamp with time zone, text, text, text, bigint, integer[], bigint, numeric, integer) IS 'Scope label, title and message of a spend alert for a calendar spend or budget_percent rule. Shared by the evaluator and the API preview / test send.';

REVOKE ALL ON FUNCTION "private"."spend_rule_alert_text"(text, text, text, text, text, uuid, uuid, uuid, text, timestamp with time zone, text, text, text, bigint, integer[], bigint, numeric, integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."spend_rule_alert_text"(text, text, text, text, text, uuid, uuid, uuid, text, timestamp with time zone, text, text, text, bigint, integer[], bigint, numeric, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_rule_alert_text"(text, text, text, text, text, uuid, uuid, uuid, text, timestamp with time zone, text, text, text, bigint, integer[], bigint, numeric, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_rule_alert_text"(text, text, text, text, text, uuid, uuid, uuid, text, timestamp with time zone, text, text, text, bigint, integer[], bigint, numeric, integer) TO "service_role";
