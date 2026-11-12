CREATE OR REPLACE FUNCTION public.lift_workspace_spend_block (
  p_workspace_id  uuid,
  p_block_id      uuid,
  p_actor_user_id uuid                     DEFAULT NULL::uuid,
  p_now           timestamp with time zone DEFAULT now()
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Lifts an active spend block by hand (lift_reason manual, lifted_by the admin when known) and
-- queues the spend_blocked "lifted" event. The evaluator does not start the rule's block again
-- until its period resets. The caller (control API or web-api) checks the caller is an owner or
-- admin, writes the audit event and republishes the gateway's entry.
-- Errors: spend_block_not_found (no such block in the workspace), spend_block_not_active (it was
-- already lifted). Returns the block as public.list_workspace_spend_blocks shows it.
declare
  v_block public.workspace_spend_blocks;
begin
  if p_workspace_id is null or p_block_id is null or p_now is null then
    raise exception 'spend_block_not_found' using errcode = 'P0002';
  end if;
  select block.* into v_block
  from public.workspace_spend_blocks block
  where block.id = p_block_id and block.workspace_id = p_workspace_id
  for update;
  if not found then
    raise exception 'spend_block_not_found' using errcode = 'P0002';
  end if;
  if v_block.lifted_at is not null then
    raise exception 'spend_block_not_active' using errcode = '55000';
  end if;

  update public.workspace_spend_blocks
  set lifted_at = greatest(p_now, started_at),
      lift_reason = 'manual',
      lifted_by = case when exists (select 1 from auth.users actor where actor.id = p_actor_user_id) then p_actor_user_id end
  where id = v_block.id;
  perform private.queue_spend_block_event(v_block.id, 'lifted', p_now);

  return public.list_workspace_spend_blocks(p_workspace_id, true, 1, v_block.id) -> 0;
end;
$function$;

COMMENT ON FUNCTION "public"."lift_workspace_spend_block"(uuid, uuid, uuid, timestamp with time zone) IS 'Lifts an active spend block by hand (manual: it stays lifted until the period resets) and queues the spend_blocked lifted event. Service role only (control API and web-api, owners and admins).';

REVOKE ALL ON FUNCTION "public"."lift_workspace_spend_block"(uuid, uuid, uuid, timestamp with time zone) FROM PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."lift_workspace_spend_block"(uuid, uuid, uuid, timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."lift_workspace_spend_block"(uuid, uuid, uuid, timestamp with time zone) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."lift_workspace_spend_block"(uuid, uuid, uuid, timestamp with time zone) TO "service_role";
