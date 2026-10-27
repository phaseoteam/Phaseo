CREATE OR REPLACE FUNCTION private.queue_spend_block_event (
  p_block_id uuid,
  p_state    text,
  p_now      timestamp with time zone
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Queues the spend_blocked event for a block that started (p_state 'started') or was lifted
-- ('lifted'): one email_outbox row deduped by spend_blocked:<block id>:<state>, so calling it twice
-- queues one event. Like spend_alert, the routed delivery job sends it to the rule's own
-- destinations or the workspace's spend_blocked routes, and the mobile push job sends it as a
-- money push (private.capture_workspace_notification_events). The rule id is in the payload, so
-- the event shows in the rule's history.
-- Returns the event id, or null when nothing was queued (no such block, a lift event for a block
-- that is still active, the workspace is being deleted, or the event already exists).
declare
  v_block record;
  v_label text;
  v_subject text;
  v_where text;
  v_so_far text;
  v_resets text;
  v_title text;
  v_message text;
  v_id uuid;
begin
  if p_block_id is null or p_state is null or p_state not in ('started', 'lifted') then
    raise exception 'invalid_spend_block_event';
  end if;

  select block.*, rule.name as rule_name, rule.period, rule.metric, workspace.name as workspace_name,
    workspace.owner_user_id, owner.email as owner_email, actor.email as lifted_by_email,
    coalesce(rule.time_zone, settings.billing_time_zone, 'UTC') as time_zone,
    case when block.scope_type = 'key' and block.scope_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then block.scope_id::uuid end as scope_key_id,
    case when block.scope_type = 'member' and block.scope_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then block.scope_id::uuid end as scope_user_id,
    case when block.scope_type = 'department' and block.scope_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then block.scope_id::uuid end as scope_department_id
    into v_block
  from public.workspace_spend_blocks block
  join public.workspaces workspace on workspace.id = block.workspace_id
  left join public.workspace_spend_rules rule on rule.id = block.rule_id
  left join public.workspace_settings settings on settings.workspace_id = block.workspace_id
  left join auth.users owner on owner.id = workspace.owner_user_id
  left join auth.users actor on actor.id = block.lifted_by
  where block.id = p_block_id;
  if not found or (p_state = 'lifted' and v_block.lifted_at is null) then
    return null;
  end if;

  v_label := private.spend_scope_label(v_block.workspace_id, v_block.scope_type, v_block.scope_id);
  v_subject := case v_block.scope_type
    when 'workspace' then 'The workspace'
    when 'key' then 'API key ''' || left(v_label, 60) || ''''
    when 'member' then v_label
    when 'department' then 'Department ''' || left(v_label, 60) || ''''
    when 'model' then v_label
    else 'Provider ' || v_block.scope_id
  end;
  v_where := case v_block.scope_type
    when 'workspace' then 'in this workspace'
    when 'key' then 'with this key'
    when 'member' then 'by this member (their keys and OAuth apps)'
    when 'department' then 'by this department'
    when 'model' then 'to this model'
    else 'routed to this provider'
  end;
  v_so_far := case v_block.period when 'day' then 'today' when 'week' then 'this week' when 'month' then 'this month' else 'this period' end;
  v_resets := case when v_block.resets_at is not null
    then to_char(v_block.resets_at at time zone v_block.time_zone, 'Mon FMDD, HH24:MI') || ' ' || v_block.time_zone end;

  if p_state = 'started' then
    v_title := 'Requests blocked: ' || left(coalesce(v_block.rule_name, 'spend rule'), 100);
    v_message := v_subject || ' has spent ' || private.workspace_push_usd(v_block.spend_nanos) || ' ' || v_so_far
      || ', past the ' || private.workspace_push_usd(v_block.limit_nanos) || ' block limit of '
      || coalesce('"' || left(v_block.rule_name, 100) || '"', 'a spend rule') || '. New requests ' || v_where
      || case when v_block.block_free_models then '' else ' to paid models' end
      || ' get a 429 until ' || coalesce(v_resets, 'spend falls below the limit')
      || ', or until an owner or admin lifts the block. Blocks start within minutes of the limit, so spend can pass it a little.';
  else
    v_title := 'Spend block lifted: ' || left(coalesce(v_block.rule_name, 'spend rule'), 100);
    v_message := v_subject || ' can send requests again. '
      || case v_block.lift_reason
        when 'manual' then coalesce(v_block.lifted_by_email, 'An owner or admin') || ' lifted the block; it stays lifted until the period resets.'
        when 'period_reset' then 'The ' || case v_block.period when 'day' then 'day' when 'week' then 'week' when 'month' then 'month' else 'period' end || ' reset.'
        when 'below_limit' then 'Spend is below the block limit again.'
        when 'rule_changed' then 'The rule changed and spend is no longer past its block limit.'
        when 'rule_disabled' then 'The rule was turned off.'
        else 'The rule was deleted.'
      end;
  end if;

  insert into public.email_outbox (kind, template, to_email, subject, workspace_id, user_id, payload, dedupe_key)
  values (
    'spend_blocked',
    'spend_blocked',
    coalesce(v_block.owner_email, ''),
    v_title,
    v_block.workspace_id,
    v_block.owner_user_id,
    jsonb_build_object(
      'title', v_title,
      'message', v_message,
      'workspace_name', v_block.workspace_name,
      'state', p_state,
      'block_id', v_block.id,
      'rule_id', v_block.rule_id,
      'rule_name', v_block.rule_name,
      'metric', v_block.metric,
      'action', 'block',
      'scope', jsonb_strip_nulls(jsonb_build_object(
        'type', v_block.scope_type,
        'id', v_block.scope_id,
        'label', v_label,
        'key_id', v_block.scope_key_id,
        'user_id', v_block.scope_user_id,
        'department_id', v_block.scope_department_id
      )),
      'period', jsonb_build_object(
        'kind', v_block.period,
        'start', v_block.period_start,
        'end', v_block.resets_at,
        'time_zone', v_block.time_zone
      ),
      'resets_at', v_block.resets_at,
      'value_nanos', v_block.spend_nanos,
      'limit_nanos', v_block.limit_nanos,
      'block_free_models', v_block.block_free_models,
      'started_at', v_block.started_at,
      'lifted_at', v_block.lifted_at,
      'lift_reason', v_block.lift_reason,
      'lifted_by', v_block.lifted_by,
      'evaluated_at', p_now,
      'url', 'https://phaseo.app/settings/notifications#spend-alerts',
      'push', jsonb_build_object(
        'title', left(v_title, 120),
        'body', left(v_message, 240),
        'href', '/settings/notifications',
        'lowerLead', false
      )
    ),
    'spend_blocked:' || v_block.id || ':' || p_state
  )
  on conflict (dedupe_key) do nothing
  returning id into v_id;

  return v_id;
end;
$function$;

COMMENT ON FUNCTION "private"."queue_spend_block_event"(uuid, text, timestamp with time zone) IS 'Queues the spend_blocked event (payload.state started or lifted) for a spend block, deduped per block and state. Called by the evaluator, the lift function and the rule-change trigger.';

REVOKE ALL ON FUNCTION "private"."queue_spend_block_event"(uuid, text, timestamp with time zone) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."queue_spend_block_event"(uuid, text, timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."queue_spend_block_event"(uuid, text, timestamp with time zone) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."queue_spend_block_event"(uuid, text, timestamp with time zone) TO "service_role";
