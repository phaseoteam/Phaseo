CREATE OR REPLACE FUNCTION private.spend_spike_alert_text (
  p_workspace_name      text,
  p_rule_name           text,
  p_scope_type          text,
  p_scope_id            text,
  p_scope_key_id        uuid,
  p_scope_user_id       uuid,
  p_scope_department_id uuid,
  p_window_hours        integer,
  p_current_nanos       numeric,
  p_baseline_nanos      numeric,
  p_multiple            numeric,
  p_multiplier          numeric,
  p_floor_nanos         bigint,
  p_baseline_windows    integer
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
  -- The text of a spike alert, in US money format: the scope's label, the title and the message,
  -- e.g. "Spend in the last 3 hours is $42.10, 4.2× your usual $10.02 for this time of day." With
  -- a baseline of 0 the message says that only the floor applied. Used by
  -- private.evaluate_workspace_spend_rules for real alerts and by public.preview_workspace_spend_rule
  -- for previews and test sends, so both read the same.
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
        when 'workspace' then ''
        when 'key' then ' by API key ''' || coalesce(left(label.label, 60), 'deleted key') || ''''
        when 'member' then ' by ' || coalesce(label.label, 'a former member')
        when 'department' then ' by department ''' || coalesce(left(label.label, 60), 'deleted department') || ''''
        when 'model' then ' on ' || coalesce(label.label, p_scope_id)
        else ' on provider ' || p_scope_id
      end as subject,
      case when p_scope_type = 'workspace' then 'your' else 'its' end as whose,
      case when p_window_hours = 1 then 'hour' else p_window_hours || ' hours' end as hours,
      private.workspace_push_usd(round(p_current_nanos)::bigint) as current_text,
      private.workspace_push_usd(round(p_baseline_nanos)::bigint) as baseline_text,
      private.workspace_push_usd(p_floor_nanos) as floor_text,
      pg_catalog.trim_scale(round(p_multiple, 1))::text || '×' as multiple_text,
      pg_catalog.trim_scale(p_multiplier)::text || '×' as multiplier_text
    from label
  )
  select
    parts.scope_label,
    left(p_rule_name, 100) || ': ' || case
      when p_baseline_nanos > 0 then 'spend ' || parts.multiple_text || ' usual in the last ' || parts.hours
      else parts.current_text || ' spent in the last ' || parts.hours
    end,
    'Spend' || parts.subject || ' in the last ' || parts.hours || ' is ' || parts.current_text
      || case
        when p_baseline_nanos > 0 then
          ', ' || parts.multiple_text || ' ' || parts.whose || ' usual ' || parts.baseline_text
            || case when p_window_hours < 24 then ' for this time of day.' else ' for ' || p_window_hours || ' hours.' end
            || case when p_window_hours < 24
              then ' The usual is the median of the same ' || parts.hours || ' on each of the previous 7 days.'
              else ' The usual is the median of the previous ' || p_baseline_windows || ' windows of ' || p_window_hours || ' hours.'
            end
            || ' Alerts at ' || parts.multiplier_text || ' and ' || parts.floor_text || ' or more.'
        else
          '. There was no spend in '
            || case when p_window_hours < 24 then 'the same ' || parts.hours || ' on the previous 7 days' else 'the previous 7 days' end
            || ', so this alert uses only the ' || parts.floor_text || ' floor.'
      end
  from parts;
$function$;

COMMENT ON FUNCTION "private"."spend_spike_alert_text"(text, text, text, text, uuid, uuid, uuid, integer, numeric, numeric, numeric, numeric, bigint, integer) IS 'Scope label, title and message of a spike spend alert (spend over the last window_hours against the median of the same window over the previous 7 days). Shared by the evaluator and the API preview / test send.';

REVOKE ALL ON FUNCTION "private"."spend_spike_alert_text"(text, text, text, text, uuid, uuid, uuid, integer, numeric, numeric, numeric, numeric, bigint, integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."spend_spike_alert_text"(text, text, text, text, uuid, uuid, uuid, integer, numeric, numeric, numeric, numeric, bigint, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_spike_alert_text"(text, text, text, text, uuid, uuid, uuid, integer, numeric, numeric, numeric, numeric, bigint, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_spike_alert_text"(text, text, text, text, uuid, uuid, uuid, integer, numeric, numeric, numeric, numeric, bigint, integer) TO "service_role";
