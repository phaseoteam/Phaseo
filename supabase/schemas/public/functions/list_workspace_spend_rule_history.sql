CREATE OR REPLACE FUNCTION public.list_workspace_spend_rule_history (
  p_workspace_id uuid,
  p_rule_id      uuid,
  p_limit        integer DEFAULT 50,
  p_offset       integer DEFAULT 0
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- A spend rule's history, newest first: the events it queued (email_outbox spend_alert and
-- spend_blocked rows whose payload names the rule, read through
-- email_outbox_spend_rule_events_idx) with their delivery counts, one page of p_limit (1-100)
-- after p_offset, plus its 12 latest workspace_spend_rule_state rows. Test sends write nothing,
-- so they are not here. Errors: spend_rule_not_found, invalid_spend_rule_history_page.
-- Returns {events: [...], has_more, periods: [...]}.
declare
  v_events jsonb;
  v_has_more boolean;
  v_periods jsonb;
begin
  if p_workspace_id is null or p_rule_id is null
    or p_limit is null or p_limit < 1 or p_limit > 100
    or p_offset is null or p_offset < 0 or p_offset > 100000 then
    raise exception 'invalid_spend_rule_history_page' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.workspace_spend_rules rule
    where rule.id = p_rule_id and rule.workspace_id = p_workspace_id and rule.deleted_at is null
  ) then
    raise exception 'spend_rule_not_found' using errcode = 'P0002';
  end if;

  with candidates as (
    select event.id, event.kind, event.created_at, event.payload
    from public.email_outbox event
    where (event.payload ->> 'rule_id') = p_rule_id::text
      and event.kind = any (array['spend_alert', 'spend_blocked'])
      and event.workspace_id = p_workspace_id
    order by event.created_at desc, event.id desc
    limit p_limit + 1
    offset p_offset
  ),
  page as (
    select candidates.*, row_number() over (order by candidates.created_at desc, candidates.id desc) as position
    from candidates
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', page.id,
      'kind', page.kind,
      'created_at', page.created_at,
      'title', page.payload ->> 'title',
      'message', page.payload ->> 'message',
      'state', page.payload ->> 'state',
      'threshold_percent', page.payload -> 'threshold_percent',
      'thresholds_crossed', page.payload -> 'thresholds_crossed',
      'threshold_amount_nanos', page.payload -> 'threshold_amount_nanos',
      'value_nanos', page.payload -> 'value_nanos',
      'base_nanos', page.payload -> 'base_nanos',
      'percent', page.payload -> 'percent',
      'period', page.payload -> 'period',
      'deliveries', jsonb_build_object('sent', deliveries.sent, 'failed', deliveries.failed, 'pending', deliveries.pending)
    ) order by page.position) filter (where page.position <= p_limit), '[]'::jsonb),
    count(*) > p_limit
    into v_events, v_has_more
  from page
  cross join lateral (
    select
      count(*) filter (where attempt.status = 'sent') as sent,
      count(*) filter (where attempt.status = 'failed') as failed,
      count(*) filter (where attempt.status not in ('sent', 'failed')) as pending
    from public.notification_delivery_attempts attempt
    where attempt.event_id = page.id
  ) deliveries;

  select coalesce(jsonb_agg(jsonb_build_object(
      'period_start', case when isfinite(state.period_start) then state.period_start end,
      'period_end', state.period_end,
      'highest_percent_fired', state.highest_percent_fired,
      'amount_fired_at', state.amount_fired_at,
      'last_fired_at', state.last_fired_at,
      'fire_count', state.fire_count,
      'last_value_nanos', state.last_value_nanos,
      'last_base_nanos', state.last_base_nanos
    ) order by state.period_start desc), '[]'::jsonb)
    into v_periods
  from (
    select * from public.workspace_spend_rule_state recent
    where recent.rule_id = p_rule_id and recent.workspace_id = p_workspace_id
    order by recent.period_start desc
    limit 12
  ) state;

  return jsonb_build_object('events', v_events, 'has_more', coalesce(v_has_more, false), 'periods', v_periods);
end;
$function$;

COMMENT ON FUNCTION "public"."list_workspace_spend_rule_history"(uuid, uuid, integer, integer) IS 'One page of a spend rule''s queued events (spend_alert, spend_blocked) with delivery counts, newest first, plus its 12 latest state rows. Service role only (control API and web-api).';

REVOKE ALL ON FUNCTION "public"."list_workspace_spend_rule_history"(uuid, uuid, integer, integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."list_workspace_spend_rule_history"(uuid, uuid, integer, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."list_workspace_spend_rule_history"(uuid, uuid, integer, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."list_workspace_spend_rule_history"(uuid, uuid, integer, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."list_workspace_spend_rule_history"(uuid, uuid, integer, integer) FROM "anon", "authenticated";
