CREATE OR REPLACE FUNCTION public.lift_spend_blocks_on_rule_change ()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Lifts a spend rule's active block in the same transaction as the change that ends it, so an
-- admin who turns a rule off or raises its limit unblocks at once rather than at the next sweep:
--   * the rule is deleted (DELETE, e.g. a cascade from its key, member or department, or
--     deleted_at set): rule_deleted;
--   * enabled turned off: rule_disabled;
--   * its action, metric, scope, period, time zone or base changed: rule_changed;
--   * its block point changed (block_at_amount_nanos, block_at_percent or base_amount_nanos) and
--     spend so far this period (private.spend_rule_values) is now below it: rule_changed.
-- A change to block_free_models is copied onto the active block. Each lift queues a
-- spend_blocked "lifted" event. Nothing happens while the workspace itself is being deleted
-- (its blocks go with it). The API that made the change republishes the gateway's entry.
declare
  v_rule public.workspace_spend_rules;
  v_block public.workspace_spend_blocks;
  v_reason text;
  v_value numeric;
  v_base bigint;
  v_limit numeric;
begin
  v_rule := case when tg_op = 'DELETE' then old else new end;
  select block.* into v_block
  from public.workspace_spend_blocks block
  where block.rule_id = old.id and block.lifted_at is null
  for update;
  if not found or not exists (select 1 from public.workspaces workspace where workspace.id = old.workspace_id) then
    return v_rule;
  end if;

  if tg_op = 'DELETE' or new.deleted_at is not null then
    v_reason := 'rule_deleted';
  elsif not new.enabled then
    v_reason := 'rule_disabled';
  elsif new.action <> 'block'
    or new.metric is distinct from old.metric
    or new.scope_type is distinct from old.scope_type
    or new.scope_id is distinct from old.scope_id
    or new.period is distinct from old.period
    or new.window_hours is distinct from old.window_hours
    or new.time_zone is distinct from old.time_zone
    or new.base_kind is distinct from old.base_kind
    or new.base_ref is distinct from old.base_ref then
    v_reason := 'rule_changed';
  elsif new.block_at_amount_nanos is distinct from old.block_at_amount_nanos
    or new.block_at_percent is distinct from old.block_at_percent
    or new.base_amount_nanos is distinct from old.base_amount_nanos then
    select value.value_nanos, value.base_nanos into v_value, v_base
    from private.spend_rule_values(new.workspace_id, now(), new.id) value;
    v_limit := case new.metric
      when 'spend' then new.block_at_amount_nanos
      when 'budget_percent' then case when v_base > 0 then ceil(new.block_at_percent::numeric * v_base / 100) end
    end;
    if v_limit is null or coalesce(v_value, 0) < v_limit then
      v_reason := 'rule_changed';
    end if;
  end if;

  if v_reason is null then
    if new.block_free_models is distinct from v_block.block_free_models then
      update public.workspace_spend_blocks set block_free_models = new.block_free_models where id = v_block.id;
    end if;
    return v_rule;
  end if;

  update public.workspace_spend_blocks
  set lifted_at = greatest(now(), started_at), lift_reason = v_reason
  where id = v_block.id;
  perform private.queue_spend_block_event(v_block.id, 'lifted', now());
  return v_rule;
end;
$function$;

COMMENT ON FUNCTION "public"."lift_spend_blocks_on_rule_change"() IS 'Trigger on workspace_spend_rules (after update, before delete): lifts the rule''s active spend block when the rule is deleted, disabled, changed in scope or period, or its block point rises above spend so far, and queues the spend_blocked lifted event.';

GRANT EXECUTE ON FUNCTION "public"."lift_spend_blocks_on_rule_change"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."lift_spend_blocks_on_rule_change"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."lift_spend_blocks_on_rule_change"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."lift_spend_blocks_on_rule_change"() FROM PUBLIC, "anon", "authenticated";
