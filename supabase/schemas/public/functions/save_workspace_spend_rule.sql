CREATE OR REPLACE FUNCTION public.save_workspace_spend_rule (
  p_workspace_id    uuid,
  p_rule_id         uuid,
  p_rule            jsonb,
  p_destination_ids uuid[],
  p_actor_user_id   uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Creates (p_rule_id null) or replaces (p_rule_id set) a spend rule and its destinations in one
-- transaction, for the control API and web-api, which validate the whole rule first and pass
-- every editable column in p_rule. The table's trigger and CHECK constraints still decide.
--   * p_destination_ids null keeps the rule's destinations; an array (at most 50, each an
--     active or disabled notification destination of the workspace) replaces them. An empty
--     array means the workspace's spend_alert routes apply.
--   * An enabled rule marks the workspace in workspace_spend_rule_dirty, so the sweep evaluates
--     it within one tick.
-- Errors: spend_rule_not_found, too_many_spend_rule_destinations,
-- notification_destination_not_found, plus the table's (spend_rule_limit_reached,
-- invalid_time_zone, invalid_spend_rule_scope_id, constraint names).
-- Returns {rule: <row>, destination_ids: [...]}.
declare
  v_input public.workspace_spend_rules;
  v_rule public.workspace_spend_rules;
begin
  if p_workspace_id is null or p_rule is null or jsonb_typeof(p_rule) <> 'object' then
    raise exception 'invalid_spend_rule' using errcode = '22023';
  end if;
  if p_destination_ids is not null then
    if cardinality(p_destination_ids) > 50 then
      raise exception 'too_many_spend_rule_destinations' using errcode = '22023';
    end if;
    if exists (
      select 1 from unnest(p_destination_ids) requested(destination_id)
      where requested.destination_id is null or not exists (
        select 1 from public.notification_destinations destination
        where destination.id = requested.destination_id
          and destination.workspace_id = p_workspace_id
          and destination.status <> 'deleted'
          and not destination.is_ephemeral
      )
    ) then
      raise exception 'notification_destination_not_found' using errcode = '23503';
    end if;
  end if;

  v_input := jsonb_populate_record(null::public.workspace_spend_rules, p_rule);

  if p_rule_id is null then
    insert into public.workspace_spend_rules (
      workspace_id, name, enabled, metric, scope_type, scope_id, period, window_hours, time_zone,
      base_kind, base_ref, base_amount_nanos, threshold_percents, threshold_amount_nanos, runway_days,
      spike_multiplier, spike_floor_nanos, action, block_at_percent, block_at_amount_nanos,
      block_free_models, cooldown_minutes, created_by
    )
    values (
      p_workspace_id, v_input.name, coalesce(v_input.enabled, true), v_input.metric,
      coalesce(v_input.scope_type, 'workspace'), v_input.scope_id, v_input.period, v_input.window_hours,
      v_input.time_zone, v_input.base_kind, v_input.base_ref, v_input.base_amount_nanos, v_input.threshold_percents,
      v_input.threshold_amount_nanos, v_input.runway_days, v_input.spike_multiplier, v_input.spike_floor_nanos,
      coalesce(v_input.action, 'notify'), coalesce(v_input.block_at_percent, 110), v_input.block_at_amount_nanos,
      coalesce(v_input.block_free_models, false), coalesce(v_input.cooldown_minutes, 360), p_actor_user_id
    )
    returning * into v_rule;
  else
    update public.workspace_spend_rules rule set
      name = v_input.name,
      enabled = coalesce(v_input.enabled, true),
      metric = v_input.metric,
      scope_type = coalesce(v_input.scope_type, 'workspace'),
      scope_id = v_input.scope_id,
      period = v_input.period,
      window_hours = v_input.window_hours,
      time_zone = v_input.time_zone,
      base_kind = v_input.base_kind,
      base_ref = v_input.base_ref,
      base_amount_nanos = v_input.base_amount_nanos,
      threshold_percents = v_input.threshold_percents,
      threshold_amount_nanos = v_input.threshold_amount_nanos,
      runway_days = v_input.runway_days,
      spike_multiplier = v_input.spike_multiplier,
      spike_floor_nanos = v_input.spike_floor_nanos,
      action = coalesce(v_input.action, 'notify'),
      block_at_percent = coalesce(v_input.block_at_percent, 110),
      block_at_amount_nanos = v_input.block_at_amount_nanos,
      block_free_models = coalesce(v_input.block_free_models, false),
      cooldown_minutes = coalesce(v_input.cooldown_minutes, 360)
    where rule.id = p_rule_id and rule.workspace_id = p_workspace_id and rule.deleted_at is null
    returning * into v_rule;
    if not found then
      raise exception 'spend_rule_not_found' using errcode = 'P0002';
    end if;
  end if;

  if p_destination_ids is not null then
    delete from public.workspace_spend_rule_destinations link
    where link.rule_id = v_rule.id and not (link.destination_id = any (p_destination_ids));
    insert into public.workspace_spend_rule_destinations (rule_id, destination_id, workspace_id)
    select distinct v_rule.id, requested.destination_id, p_workspace_id
    from unnest(p_destination_ids) requested(destination_id)
    on conflict (rule_id, destination_id) do nothing;
  end if;

  if v_rule.enabled then
    insert into public.workspace_spend_rule_dirty (workspace_id) values (p_workspace_id)
    on conflict (workspace_id) do nothing;
  end if;

  return jsonb_build_object(
    'rule', to_jsonb(v_rule),
    'destination_ids', coalesce((
      select jsonb_agg(link.destination_id order by link.destination_id)
      from public.workspace_spend_rule_destinations link
      where link.rule_id = v_rule.id
    ), '[]'::jsonb)
  );
end;
$function$;

COMMENT ON FUNCTION "public"."save_workspace_spend_rule"(uuid, uuid, jsonb, uuid[], uuid) IS 'Creates or replaces a spend rule and (when p_destination_ids is not null) its destinations in one transaction, and marks the workspace for evaluation. Service role only (control API and web-api).';

REVOKE ALL ON FUNCTION "public"."save_workspace_spend_rule"(uuid, uuid, jsonb, uuid[], uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."save_workspace_spend_rule"(uuid, uuid, jsonb, uuid[], uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."save_workspace_spend_rule"(uuid, uuid, jsonb, uuid[], uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."save_workspace_spend_rule"(uuid, uuid, jsonb, uuid[], uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."save_workspace_spend_rule"(uuid, uuid, jsonb, uuid[], uuid) FROM "anon", "authenticated";
