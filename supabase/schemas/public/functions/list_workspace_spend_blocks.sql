CREATE OR REPLACE FUNCTION public.list_workspace_spend_blocks (
  p_workspace_id   uuid,
  p_include_lifted boolean DEFAULT false,
  p_limit          integer DEFAULT 50,
  p_block_id       uuid    DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- A workspace's spend blocks for the control API and Settings, newest first: active ones only,
  -- or with p_include_lifted also lifted ones (up to p_limit, 1-100), or the one p_block_id names.
  -- Each has its rule's current name and the scope's display name. A block whose reset has passed
  -- but that the sweep has not lifted yet is listed as active: false.
  select coalesce(jsonb_agg(item.block order by item.started_at desc, item.id), '[]'::jsonb)
  from (
    select block.id, block.started_at, jsonb_build_object(
      'id', block.id,
      'workspace_id', block.workspace_id,
      'rule_id', block.rule_id,
      'rule_name', rule.name,
      'scope_type', block.scope_type,
      'scope_id', block.scope_id,
      'scope_label', private.spend_scope_label(block.workspace_id, block.scope_type, block.scope_id),
      'block_free_models', block.block_free_models,
      'period_start', block.period_start,
      'resets_at', block.resets_at,
      'spend_nanos', block.spend_nanos,
      'limit_nanos', block.limit_nanos,
      'started_at', block.started_at,
      'lifted_at', block.lifted_at,
      'lifted_by', block.lifted_by,
      'lift_reason', block.lift_reason,
      'active', block.lifted_at is null and (block.resets_at is null or block.resets_at > now())
    ) as block
    from public.workspace_spend_blocks block
    left join public.workspace_spend_rules rule on rule.id = block.rule_id
    where block.workspace_id = p_workspace_id
      and case
        when p_block_id is not null then block.id = p_block_id
        when coalesce(p_include_lifted, false) then true
        else block.lifted_at is null
      end
    order by block.started_at desc, block.id
    limit greatest(1, least(coalesce(p_limit, 50), 100))
  ) item;
$function$;

COMMENT ON FUNCTION "public"."list_workspace_spend_blocks"(uuid, boolean, integer, uuid) IS 'A workspace''s spend blocks, newest first (active only by default), with rule and scope names. Service role only (control API and web-api).';

REVOKE ALL ON FUNCTION "public"."list_workspace_spend_blocks"(uuid, boolean, integer, uuid) FROM PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."list_workspace_spend_blocks"(uuid, boolean, integer, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."list_workspace_spend_blocks"(uuid, boolean, integer, uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."list_workspace_spend_blocks"(uuid, boolean, integer, uuid) TO "service_role";
