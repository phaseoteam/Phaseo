CREATE OR REPLACE FUNCTION public.sweep_spend_rules (
  p_now   timestamp with time zone DEFAULT now(),
  p_limit  integer                  DEFAULT 100,
  p_blocks boolean                  DEFAULT false
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Evaluates spend rules (private.evaluate_workspace_spend_rules) for four sets of workspaces,
-- each up to p_limit, every workspace at most once per call:
--   1. dirty:    workspace_spend_rule_dirty rows, which process_v2_analytics_outbox writes when
--                it rebuilds a workspace's usage. They are claimed with SKIP LOCKED and deleted
--                as they are claimed, oldest first; a workspace marked again while this runs is
--                kept for the next call.
--   2. rollover: workspaces with an enabled rule that has no state row for its current period,
--                so a new day, week or month (in the rule's time zone) or a new rule is picked up
--                within one call, with or without traffic, and workspaces with an active block
--                past its reset, so the block lifts on time.
--   3. periodic: one twelfth of the workspaces with enabled rules, by a hash of the workspace id
--                and the 5-minute slot of p_now, so each is evaluated about once an hour when
--                called every 5 minutes. This catches changes no usage marks: a budget or key
--                limit lowered, a rule edited, rollup hours rebuilt late. A slot over p_limit
--                rotates hourly, so none of its workspaces is skipped for good. Spike rules do
--                not count here: a spike needs new usage, which marks the workspace dirty (a
--                workspace with other rules still evaluates its spike rules in this pass).
--   4. balance:  workspaces with balance rules, in one of three slices by the same hash (each
--                every 15 minutes): a balance falls or recovers without new usage (reservations,
--                refunds, top-ups, credits), so balance rules cannot wait for the dirty mark.
-- Workspaces that no longer exist are skipped. One sweep runs at a time; a concurrent call
-- returns skipped_locked. p_blocks (SPEND_RULE_BLOCKS_ENABLED) lets block rules start blocks;
-- blocks are lifted either way. Returns the counts, the events queued, the block changes
-- ("blocks": [{workspace_id, block_id, rule_id, state, reason, event_id}]) and "publish": the
-- evaluated workspaces with block rules or blocks, whose gateway entry the job republishes.
declare
  v_slots constant integer := 12;
  v_slot integer;
  v_round bigint;
  v_dirty uuid[];
  v_rollover uuid[];
  v_periodic uuid[];
  v_balance_slots constant integer := 3;
  v_balance_round bigint;
  v_balance uuid[];
  v_workspace uuid;
  v_result jsonb;
  v_events jsonb := '[]'::jsonb;
  v_blocks jsonb := '[]'::jsonb;
  v_publish uuid[] := '{}';
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
    return jsonb_build_object('skipped_locked', true, 'dirty', 0, 'rollover', 0, 'periodic', 0, 'balance', 0, 'evaluated', 0,
      'rules', 0, 'fired', 0, 'state_rows', 0, 'events', '[]'::jsonb, 'blocks', '[]'::jsonb, 'publish', '[]'::jsonb);
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
    select rule.workspace_id
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
    union
    -- workspace_spend_blocks_workspace_active_idx
    select block.workspace_id
    from public.workspace_spend_blocks block
    where block.lifted_at is null
      and block.resets_at <= p_now
      and block.workspace_id <> all (v_dirty)
    order by 1
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
          -- Spike rules need new usage to spike, so the dirty pass covers them.
          and rule.metric <> 'spike'
          and (pg_catalog.hashtextextended(rule.workspace_id::text, 0) % v_slots + v_slots) % v_slots = v_slot
          and rule.workspace_id <> all (v_dirty)
          and rule.workspace_id <> all (v_rollover)
      ) candidate
    ) slot
    where ((slot.position - v_round * p_limit) % slot.total + slot.total) % slot.total < p_limit
  ) due;

  -- Balance rules: a balance moves without usage (reservations, refunds, top-ups, credits), so
  -- workspaces with balance rules are also taken in one of three slices by the same hash, that
  -- is every 15 minutes when called every 5 minutes. Like the periodic slot, a slice with more
  -- than p_limit workspaces starts p_limit further along on each visit. Positions are taken over
  -- the whole slice and workspaces another set already evaluates are dropped afterwards, so the
  -- window does not shift with them and every workspace is reached within ceil(n / p_limit) visits.
  v_balance_round := floor(extract(epoch from p_now) / 900)::bigint;
  select coalesce(array_agg(due.workspace_id), '{}') into v_balance
  from (
    select slice.workspace_id
    from (
      select candidate.workspace_id,
        pg_catalog.row_number() over (order by candidate.workspace_id) - 1 as position,
        pg_catalog.count(*) over () as total
      from (
        select distinct rule.workspace_id
        from public.workspace_spend_rules rule
        where rule.metric = 'balance'
          and rule.enabled
          and rule.deleted_at is null
          and private.spend_rule_evaluable(rule.metric, rule.period, rule.base_kind)
          and (pg_catalog.hashtextextended(rule.workspace_id::text, 0) % v_balance_slots + v_balance_slots) % v_balance_slots
            = v_slot % v_balance_slots
      ) candidate
    ) slice
    where ((slice.position - v_balance_round * p_limit) % slice.total + slice.total) % slice.total < p_limit
      and slice.workspace_id <> all (v_dirty)
      and slice.workspace_id <> all (v_rollover)
      and slice.workspace_id <> all (v_periodic)
  ) due;

  foreach v_workspace in array v_dirty || v_rollover || v_periodic || v_balance loop
    v_result := private.evaluate_workspace_spend_rules(v_workspace, p_now, coalesce(p_blocks, false));
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
    if jsonb_array_length(coalesce(v_result -> 'blocks', '[]'::jsonb)) > 0 then
      v_blocks := v_blocks || (
        select jsonb_agg(block || jsonb_build_object('workspace_id', v_workspace))
        from jsonb_array_elements(v_result -> 'blocks') block
      );
    end if;
    if coalesce((v_result ->> 'block_scope')::boolean, false) then
      v_publish := v_publish || v_workspace;
    end if;
  end loop;

  return jsonb_build_object(
    'dirty', cardinality(v_dirty),
    'rollover', cardinality(v_rollover),
    'periodic', cardinality(v_periodic),
    'balance', cardinality(v_balance),
    'evaluated', v_evaluated,
    'rules', v_rules,
    'fired', v_fired,
    'state_rows', v_state_rows,
    'events', v_events,
    'blocks', v_blocks,
    'publish', to_jsonb(v_publish)
  );
end;
$function$;

COMMENT ON FUNCTION "public"."sweep_spend_rules"(timestamp with time zone, integer, boolean) IS 'Evaluates spend rules for dirty workspaces (claimed with SKIP LOCKED), workspaces whose rule periods rolled over or whose blocks reached their reset, an hourly slice of the workspaces with enabled rules other than spike rules (which need new usage, so the dirty pass covers them), and a 15-minute slice of workspaces with balance rules. Queues alerts, lifts blocks and, with p_blocks, starts them. Called every 5 minutes by the API scheduled job when SPEND_RULES_ENABLED is true (p_blocks = SPEND_RULE_BLOCKS_ENABLED).';

GRANT EXECUTE ON FUNCTION "public"."sweep_spend_rules"(timestamp with time zone, integer, boolean) TO "service_role";

REVOKE ALL ON FUNCTION "public"."sweep_spend_rules"(timestamp with time zone, integer, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."sweep_spend_rules"(timestamp with time zone, integer, boolean) TO "postgres";

REVOKE ALL ON FUNCTION "public"."sweep_spend_rules"(timestamp with time zone, integer, boolean) FROM PUBLIC, "anon", "authenticated";
