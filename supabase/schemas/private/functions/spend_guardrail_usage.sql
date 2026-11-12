CREATE OR REPLACE FUNCTION private.spend_guardrail_usage (
  p_workspace_id        uuid,
  p_now                 timestamp with time zone,
  p_exclude_request_ids text[] DEFAULT '{}'::text[],
  p_action              text DEFAULT NULL::text
)
  RETURNS TABLE (
    guardrail_id   uuid,
    guardrail_name text,
    spend_period   text,
    spend_action   text,
    spend_counting text,
    limit_nanos    bigint,
    counter        text,
    key_ids        uuid[],
    usage_nanos    bigint,
    period_start   timestamp with time zone,
    reset_at       timestamp with time zone
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- Every spend counter of the workspace's enabled spend guardrails (only those whose action is
  -- p_action, when given), with the keys that count toward it and their spend this UTC period.
  -- A key is covered where public.resolve_key_guardrails says the guardrail applies to it.
  -- A shared guardrail has one counter per assignment (counter 'workspace:', 'department:<id>',
  -- 'member:<id>' or 'key:<id>'), over every key that assignment covers; an each_key guardrail has
  -- one counter per covered key ('key:<id>'). Spend is counted exactly like key cost limits, by
  -- private.key_spend_items over those keys since the period start: request cost (charged
  -- failures included) unless money movements replace it, plus the movements themselves at their
  -- time (stepped charges and refunds, one-off charges without a request row, batch and video
  -- debits, uncollected expected bills). p_exclude_request_ids are the ids of admissions the
  -- SpendLimit Durable Object holds (request ids and billing ids), left out of rows and charges
  -- alike, as for department budgets.
  with spend_guardrails as (
    select g.id, g.name, g.spend_period, g.spend_action, g.spend_counting, g.spend_limit_nanos
    from public.workspace_guardrails g
    where g.workspace_id = p_workspace_id
      and g.kind = 'spend'
      and g.enabled
      and (p_action is null or g.spend_action = p_action)
  ),
  covered as (
    select distinct
      sg.id as guardrail_id,
      case when sg.spend_counting = 'each_key' then 'key:' || k.id::text
        else r.source_type || ':' || coalesce(r.source_id::text, '') end as counter,
      k.id as key_id
    from public.keys k
    cross join lateral public.resolve_key_guardrails(p_workspace_id, k.id) r
    join spend_guardrails sg on sg.id = r.guardrail_id
    where k.workspace_id = p_workspace_id
      and exists (select 1 from spend_guardrails)
  ),
  counters as (
    select covered.guardrail_id, covered.counter, array_agg(covered.key_id order by covered.key_id) as key_ids
    from covered
    group by covered.guardrail_id, covered.counter
  )
  select
    sg.id,
    sg.name,
    sg.spend_period,
    sg.spend_action,
    sg.spend_counting,
    sg.spend_limit_nanos,
    c.counter,
    c.key_ids,
    coalesce((
      select sum(item.nanos)
      from private.key_spend_items(p_workspace_id, p.period_start, c.key_ids,
        coalesce(p_exclude_request_ids, '{}'::text[]), coalesce(p_exclude_request_ids, '{}'::text[])) item
      where item.at >= coalesce(p.period_start, '-infinity'::timestamptz)
        and item.at <= p_now
    ), 0)::bigint,
    p.period_start,
    p.reset_at
  from counters c
  join spend_guardrails sg on sg.id = c.guardrail_id
  cross join lateral private.spend_limit_period(sg.spend_period, p_now) p
  order by sg.name, sg.id, c.counter;
$function$;

COMMENT ON FUNCTION "private"."spend_guardrail_usage"(uuid, timestamp with time zone, text[], text) IS 'Spend counters of a workspace''s enabled spend guardrails: one per assignment when shared, one per covered key when each_key, with their keys and their spend this UTC period, counted exactly like key cost limits (private.key_spend_items).';

REVOKE ALL ON FUNCTION "private"."spend_guardrail_usage"(uuid, timestamp with time zone, text[], text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."spend_guardrail_usage"(uuid, timestamp with time zone, text[], text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_guardrail_usage"(uuid, timestamp with time zone, text[], text) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_guardrail_usage"(uuid, timestamp with time zone, text[], text) TO "service_role";
