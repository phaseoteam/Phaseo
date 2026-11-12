CREATE OR REPLACE FUNCTION public.list_spend_block_workspaces (
  p_limit integer DEFAULT 2000
)
  RETURNS SETOF uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- Workspaces that can have a gateway spend block entry: an enabled block rule, or an active
  -- block. The scheduled reconcile republishes these (plus every key already in KV), so a missed
  -- publish never lasts. Up to p_limit (1-10000), in id order.
  select workspace_id from (
    select rule.workspace_id from public.workspace_spend_rules rule
    where rule.action = 'block' and rule.enabled and rule.deleted_at is null
    union
    select block.workspace_id from public.workspace_spend_blocks block
    where block.lifted_at is null
  ) due
  order by workspace_id
  limit greatest(1, least(coalesce(p_limit, 2000), 10000));
$function$;

COMMENT ON FUNCTION "public"."list_spend_block_workspaces"(integer) IS 'Workspaces with an enabled block spend rule or an active spend block, for the scheduled republish of the gateway''s spend block entries. Service role only.';

REVOKE ALL ON FUNCTION "public"."list_spend_block_workspaces"(integer) FROM PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."list_spend_block_workspaces"(integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."list_spend_block_workspaces"(integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."list_spend_block_workspaces"(integer) TO "service_role";
