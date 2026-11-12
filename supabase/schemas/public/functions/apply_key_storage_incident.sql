CREATE OR REPLACE FUNCTION public.apply_key_storage_incident (
  p_incident_id uuid
)
  RETURNS TABLE (
    key_id       uuid,
    kid          text,
    workspace_id uuid
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_incident public.key_storage_incidents%rowtype;
  v_now timestamp with time zone := now();
begin
  -- Applies a declared incident exactly once, in one transaction: changes every
  -- matching key, records which keys it changed and their previous status, and
  -- writes a workspace audit event per key. Returns the changed keys so the
  -- caller can clear the gateway's key cache. Service-only.
  select * into v_incident from public.key_storage_incidents where id = p_incident_id for update;
  if not found then
    raise exception 'incident_not_found' using errcode = 'P0002';
  end if;
  if v_incident.applied_at is not null then
    raise exception 'incident_already_applied' using errcode = '55000';
  end if;

  create temporary table affected on commit drop as
  select key.id, key.kid, key.workspace_id, key.status as previous_status, key.name, key.prefix
  from public.keys as key
  where key.storage_locations @> array[v_incident.location_id]
    and cardinality(key.storage_locations) > 0
    and key.created_at < v_incident.keys_created_before
    and key.key_kind = 'standard'
    and key.status = any(case when v_incident.action = 'pause' then array['active'] else array['active', 'paused'] end)
    and key.name not in ('__chat_route_managed_key__', '__slack_agent_managed_key__')
  for update of key;

  update public.keys as key
  set status = case when v_incident.action = 'pause' then 'paused' else 'revoked' end,
      revoked_at = case when v_incident.action = 'pause' then key.revoked_at else v_now end,
      revoked_reason = case when v_incident.action = 'pause' then key.revoked_reason else 'storage_incident:' || v_incident.id::text end
  from affected
  where key.id = affected.id;

  insert into public.key_storage_incident_keys (incident_id, key_id, workspace_id, previous_status)
  select v_incident.id, affected.id, affected.workspace_id, affected.previous_status from affected;

  -- No actor: Phaseo took the action, not a workspace member.
  insert into public.workspace_audit_events (workspace_id, actor_user_id, action, target_type, target_id, target_name, metadata)
  select affected.workspace_id, null,
    case when v_incident.action = 'pause' then 'api_key.paused' else 'api_key.revoked' end,
    'api_key', affected.id::text, left(affected.name, 200),
    jsonb_build_object('source', 'storage_incident', 'incidentId', v_incident.id, 'storageLocation', v_incident.location_id, 'prefix', affected.prefix, 'previousStatus', affected.previous_status)
  from affected;

  update public.key_storage_incidents
  set applied_at = v_now,
      affected_keys = (select count(*) from affected),
      affected_workspaces = (select count(distinct affected.workspace_id) from affected)
  where id = v_incident.id;

  return query select affected.id, affected.kid, affected.workspace_id from affected;
end;
$function$;

COMMENT ON FUNCTION "public"."apply_key_storage_incident"(uuid) IS 'Revokes or pauses, once, every live key stored in the incident''s location and created before its cut-off, across all workspaces, recording and auditing each key. Service-only.';

GRANT EXECUTE ON FUNCTION "public"."apply_key_storage_incident"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."apply_key_storage_incident"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."apply_key_storage_incident"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."apply_key_storage_incident"(uuid) FROM PUBLIC, "anon", "authenticated";
