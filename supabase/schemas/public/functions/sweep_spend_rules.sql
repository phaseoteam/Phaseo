CREATE OR REPLACE FUNCTION public.sweep_spend_rules (
  p_now   timestamp with time zone DEFAULT now(),
  p_limit integer                  DEFAULT 100
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Evaluates spend rules (private.evaluate_workspace_spend_rules) for three sets of workspaces,
-- each up to p_limit, every workspace at most once per call:
--   1. dirty:    workspace_spend_rule_dirty rows, which process_v2_analytics_outbox writes when
--                it rebuilds a workspace's usage. They are claimed with SKIP LOCKED and deleted
--                as they are claimed, oldest first; a workspace marked again while this runs is
--                kept for the next call.
--   2. rollover: workspaces with an enabled rule that has no state row for its current period,
--                so a new day, week or month (in the rule's time zone) or a new rule is picked up
--                within one call, with or without traffic.
--   3. periodic: one twelfth of the workspaces with enabled rules, by a hash of the workspace id
--                and the 5-minute slot of p_now, so each is evaluated about once an hour when
--                called every 5 minutes. This catches changes no usage marks: a budget or key
--                limit lowered, a rule edited, rollup hours rebuilt late. A slot over p_limit
--                rotates hourly, so none of its workspaces is skipped for good.
-- Workspaces that no longer exist are skipped. One sweep runs at a time; a concurrent call
-- returns skipped_locked. Returns the counts and the events queued, plus "blocks": [] for
-- block changes (none yet: rules only notify).
declare
  v_slots constant integer := 12;
  v_slot integer;
  v_round bigint;
  v_dirty uuid[];
  v_rollover uuid[];
  v_periodic uuid[];
  v_workspace uuid;
  v_result jsonb;
  v_events jsonb := '[]'::jsonb;
  v_evaluated integer := 0;
  v_rules integer := 0;
  v_fired integer := 0;
  v_state_rows integer := 0;
begin
  if p_now is null then
    raise exception 'invalid_spend_rule_sweep_time';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'invalid_spend_rule_sweep_limit';
  end if;
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('public.sweep_spend_rules', 0)) then
    return jsonb_build_object('skipped_locked', true, 'dirty', 0, 'rollover', 0, 'periodic', 0, 'evaluated', 0,
      'rules', 0, 'fired', 0, 'state_rows', 0, 'events', '[]'::jsonb, 'blocks', '[]'::jsonb);
  end if;

  with claimed as (
    delete from public.workspace_spend_rule_dirty dirty
    where dirty.workspace_id in (
      select candidate.workspace_id
      from public.workspace_spend_rule_dirty candidate
      order by candidate.dirtied_at, candidate.workspace_id
      limit p_limit
      for update skip locked
    )
    returning dirty.workspace_id
  )
  select coalesce(array_agg(claimed.workspace_id), '{}') into v_dirty from claimed;

  select coalesce(array_agg(due.workspace_id), '{}') into v_rollover
  from (
    select distinct rule.workspace_id
    from public.workspace_spend_rules rule
    left join public.workspace_settings settings on settings.workspace_id = rule.workspace_id
    cross join lateral private.spend_rule_period(rule.period, coalesce(rule.time_zone, settings.billing_time_zone, 'UTC'), p_now) period
    where rule.enabled
      and rule.deleted_at is null
      and private.spend_rule_evaluable(rule.metric, rule.period, rule.base_kind)
      and rule.workspace_id <> all (v_dirty)
      and not exists (
        select 1 from public.workspace_spend_rule_state state
        where state.rule_id = rule.id and state.period_start = period.period_start
      )
    order by rule.workspace_id
    limit p_limit
  ) due;

  v_slot := (floor(extract(epoch from p_now) / 300)::bigint % v_slots)::integer;
  -- A slot with more than p_limit workspaces starts p_limit further along each hour, so every
  -- workspace in it is reached within ceil(n / p_limit) hours instead of only the first p_limit.
  v_round := floor(extract(epoch from p_now) / 3600)::bigint;
  select coalesce(array_agg(due.workspace_id), '{}') into v_periodic
  from (
    select slot.workspace_id
    from (
      select candidate.workspace_id,
        pg_catalog.row_number() over (order by candidate.workspace_id) - 1 as position,
        pg_catalog.count(*) over () as total
      from (
        select distinct rule.workspace_id
        from public.workspace_spend_rules rule
        where rule.enabled
          and rule.deleted_at is null
          and private.spend_rule_evaluable(rule.metric, rule.period, rule.base_kind)
          and (pg_catalog.hashtextextended(rule.workspace_id::text, 0) % v_slots + v_slots) % v_slots = v_slot
          and rule.workspace_id <> all (v_dirty)
          and rule.workspace_id <> all (v_rollover)
      ) candidate
    ) slot
    where ((slot.position - v_round * p_limit) % slot.total + slot.total) % slot.total < p_limit
  ) due;

  foreach v_workspace in array v_dirty || v_rollover || v_periodic loop
    v_result := private.evaluate_workspace_spend_rules(v_workspace, p_now);
    if coalesce((v_result ->> 'missing')::boolean, false) then
      continue;
    end if;
    v_evaluated := v_evaluated + 1;
    v_rules := v_rules + coalesce((v_result ->> 'rules')::integer, 0);
    v_fired := v_fired + coalesce((v_result ->> 'fired')::integer, 0);
    v_state_rows := v_state_rows + coalesce((v_result ->> 'state_rows')::integer, 0);
    if jsonb_array_length(v_result -> 'events') > 0 then
      v_events := v_events || (
        select jsonb_agg(event || jsonb_build_object('workspace_id', v_workspace))
        from jsonb_array_elements(v_result -> 'events') event
      );
    end if;
  end loop;

  return jsonb_build_object(
    'dirty', cardinality(v_dirty),
    'rollover', cardinality(v_rollover),
    'periodic', cardinality(v_periodic),
    'evaluated', v_evaluated,
    'rules', v_rules,
    'fired', v_fired,
    'state_rows', v_state_rows,
    'events', v_events,
    'blocks', '[]'::jsonb
  );
end;
$function$;

COMMENT ON FUNCTION "public"."sweep_spend_rules"(timestamp with time zone, integer) IS 'Evaluates spend rules for dirty workspaces (claimed with SKIP LOCKED), workspaces whose rule periods rolled over, and an hourly slice of all workspaces with enabled rules. Notify only. Called every 5 minutes by the API scheduled job when SPEND_RULES_ENABLED is true.';

GRANT EXECUTE ON FUNCTION "public"."sweep_spend_rules"(timestamp with time zone, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."sweep_spend_rules"(timestamp with time zone, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."sweep_spend_rules"(timestamp with time zone, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."sweep_spend_rules"(timestamp with time zone, integer) FROM PUBLIC, "anon", "authenticated";
