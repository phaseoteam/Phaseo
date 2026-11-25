CREATE OR REPLACE FUNCTION public.rotate_api_key (
  p_workspace_id        uuid,
  p_key_id              uuid,
  p_name                text,
  p_kid                 text,
  p_hash                text,
  p_prefix              text,
  p_created_by          uuid,
  p_expire_previous     boolean,
  p_previous_expires_at timestamp with time zone
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Replaces an API key with a new secret in one transaction. The replacement gets the old key's
-- settings and everything that points at the old key, so rotating never drops a guardrail:
-- * settings on the key row: limits, IP allowlist, storage locations, never-store-content,
--   soft block, department and scopes;
-- * key_guardrails (every kind: access, safety, rate and spend guardrails);
-- * broadcast_destination_keys (observability destinations, include and exclude filters);
-- * gateway_dynamic_route_keys (the key's dynamic route);
-- * workspace_spend_rules scoped to the key, with their notification destinations.
-- The old key keeps its own links, so it stays protected until it expires. Every other table that
-- references public.keys holds history or cannot apply to a rotated key; the list, with reasons,
-- is in supabase/tests/rotate-api-key.test.mjs, which fails when a new table references keys.
-- p_expire_previous sets the old key's expires_at to p_previous_expires_at (NULL means never).
-- The workspace is queued for a gateway publication, which republishes its rate limit plan: the
-- keys table has no INSERT publication trigger, so a copied department link would otherwise wait
-- for an unrelated change. Runs as definer because only postgres may queue publications; callers
-- are limited to the service role by the grants below.
declare
  v_old public.keys%rowtype;
  v_new_id uuid;
  v_guardrails integer := 0;
  v_rate_guardrails integer := 0;
  v_destinations integer := 0;
  v_dynamic_routes integer := 0;
  v_spend_rules integer := 0;
  v_rule record;
  v_rule_id uuid;
begin
  select * into v_old
  from public.keys k
  where k.id = p_key_id
    and k.workspace_id = p_workspace_id
  for update;

  if not found or v_old.status = 'deleted' then
    raise exception 'api_key_not_found' using errcode = 'P0002';
  end if;
  if v_old.key_kind = 'workload_identity' then
    raise exception 'key_not_rotatable'
      using errcode = '23514', detail = 'Workload identity keys have no secret to rotate.';
  end if;
  if nullif(btrim(p_name), '') is null then
    raise exception 'api_key_name_required' using errcode = '22023';
  end if;

  insert into public.keys (
    workspace_id, name, kid, hash, prefix, status, scopes, created_by,
    soft_blocked, ip_allowlist, storage_locations, never_store_content, department_id,
    daily_limit_requests, weekly_limit_requests, monthly_limit_requests,
    daily_limit_cost_nanos, weekly_limit_cost_nanos, monthly_limit_cost_nanos
  ) values (
    v_old.workspace_id, btrim(p_name), p_kid, p_hash, p_prefix, 'active', coalesce(v_old.scopes, '[]'), p_created_by,
    v_old.soft_blocked, v_old.ip_allowlist, v_old.storage_locations, v_old.never_store_content, v_old.department_id,
    greatest(v_old.daily_limit_requests, 0), greatest(v_old.weekly_limit_requests, 0), greatest(v_old.monthly_limit_requests, 0),
    greatest(v_old.daily_limit_cost_nanos, 0), greatest(v_old.weekly_limit_cost_nanos, 0), greatest(v_old.monthly_limit_cost_nanos, 0)
  )
  returning id into v_new_id;

  insert into public.key_guardrails (key_id, guardrail_id)
  select v_new_id, kg.guardrail_id
  from public.key_guardrails kg
  where kg.key_id = p_key_id;
  get diagnostics v_guardrails = row_count;

  select count(*) into v_rate_guardrails
  from public.key_guardrails kg
  join public.workspace_guardrails g on g.id = kg.guardrail_id
  where kg.key_id = v_new_id
    and g.kind = 'rate';

  insert into public.broadcast_destination_keys (destination_id, key_id, filter_mode)
  select bdk.destination_id, v_new_id, bdk.filter_mode
  from public.broadcast_destination_keys bdk
  where bdk.key_id = p_key_id;
  get diagnostics v_destinations = row_count;

  insert into public.gateway_dynamic_route_keys (route_id, key_id, attached_by)
  select drk.route_id, v_new_id, drk.attached_by
  from public.gateway_dynamic_route_keys drk
  where drk.key_id = p_key_id;
  get diagnostics v_dynamic_routes = row_count;

  for v_rule in
    select r.*
    from public.workspace_spend_rules r
    where r.workspace_id = p_workspace_id
      and r.scope_type = 'key'
      and r.scope_key_id = p_key_id
      and r.deleted_at is null
    order by r.created_at, r.id
  loop
    insert into public.workspace_spend_rules (
      workspace_id, name, enabled, metric, scope_type, scope_id, period, window_hours, time_zone,
      base_kind, base_ref, base_amount_nanos, threshold_percents, threshold_amount_nanos, runway_days,
      spike_multiplier, spike_floor_nanos, action, block_at_percent, block_at_amount_nanos,
      block_free_models, cooldown_minutes, created_by
    ) values (
      v_rule.workspace_id, v_rule.name, v_rule.enabled, v_rule.metric, 'key', v_new_id::text, v_rule.period,
      v_rule.window_hours, v_rule.time_zone, v_rule.base_kind, v_rule.base_ref, v_rule.base_amount_nanos,
      v_rule.threshold_percents, v_rule.threshold_amount_nanos, v_rule.runway_days, v_rule.spike_multiplier,
      v_rule.spike_floor_nanos, v_rule.action, v_rule.block_at_percent, v_rule.block_at_amount_nanos,
      v_rule.block_free_models, v_rule.cooldown_minutes, v_rule.created_by
    )
    returning id into v_rule_id;

    insert into public.workspace_spend_rule_destinations (rule_id, destination_id, workspace_id)
    select v_rule_id, d.destination_id, d.workspace_id
    from public.workspace_spend_rule_destinations d
    where d.rule_id = v_rule.id
      and d.workspace_id = v_rule.workspace_id;

    v_spend_rules := v_spend_rules + 1;
  end loop;

  if p_expire_previous then
    update public.keys
    set expires_at = p_previous_expires_at
    where id = p_key_id
      and workspace_id = p_workspace_id;
  end if;

  perform private.enqueue_gateway_workspace_publication(p_workspace_id);

  return jsonb_build_object(
    'replacement_key_id', v_new_id,
    'previous_expires_at', v_old.expires_at,
    'carried', jsonb_build_object(
      'guardrails', v_guardrails,
      'rate_guardrails', v_rate_guardrails,
      'destinations', v_destinations,
      'dynamic_routes', v_dynamic_routes,
      'spend_rules', v_spend_rules,
      'department', v_old.department_id is not null
    )
  );
end;
$function$;

COMMENT ON FUNCTION "public"."rotate_api_key"(uuid, uuid, text, text, text, text, uuid, boolean, timestamp with time zone) IS 'Replaces an API key with a new secret in one transaction, copying its settings, guardrails, observability destinations, dynamic route and key spend rules to the replacement. The old key keeps its links until it expires.';

GRANT EXECUTE ON FUNCTION "public"."rotate_api_key"(uuid, uuid, text, text, text, text, uuid, boolean, timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."rotate_api_key"(uuid, uuid, text, text, text, text, uuid, boolean, timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."rotate_api_key"(uuid, uuid, text, text, text, text, uuid, boolean, timestamp with time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."rotate_api_key"(uuid, uuid, text, text, text, text, uuid, boolean, timestamp with time zone) FROM PUBLIC, "anon", "authenticated";
