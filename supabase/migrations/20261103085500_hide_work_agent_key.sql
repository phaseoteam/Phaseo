-- Leaves the work tracker's triage agent key (__work_agent_managed_key__) out of the key security
-- report and storage-location incidents, as the Chat and Slack agent keys already are.
-- Matches the definitions in schemas/.
SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.workspace_key_security (
  p_workspace_id uuid
)
  RETURNS TABLE (
    id                uuid,
    name              text,
    prefix            text,
    status            text,
    created_by        uuid,
    owner_name        text,
    owner_email       text,
    created_at        timestamp with time zone,
    last_used_at      timestamp with time zone,
    expires_at        timestamp with time zone,
    storage_locations text[],
    has_spend_limit   boolean,
    has_ip_allowlist  boolean,
    never_used        boolean,
    idle              boolean,
    safe_to_remove    boolean,
    risk              integer
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- The workspace's live dashboard keys (active or paused, not expired), with
  -- the risks the Security page reports. Phaseo's own managed keys (Chat, the
  -- Slack agent) and OAuth-delegated keys are left out: the workspace does not
  -- store them. Service-only: callers verify workspace access first.
  with live as (
    select
      key.*,
      -- last_used_at defaults to the creation time, so a key used only at
      -- creation was never used for a request.
      (key.last_used_at is null or key.last_used_at <= key.created_at + interval '1 minute') as never_used,
      coalesce(key.last_used_at, key.created_at) as last_activity
    from public.keys as key
    where key.workspace_id = p_workspace_id
      and key.key_kind = 'standard'
      and key.status in ('active', 'paused')
      and (key.expires_at is null or key.expires_at > now())
      and key.name not in ('__chat_route_managed_key__', '__slack_agent_managed_key__', '__work_agent_managed_key__')
  ), flagged as (
    select
      live.*,
      (live.daily_limit_cost_nanos > 0 or live.weekly_limit_cost_nanos > 0 or live.monthly_limit_cost_nanos > 0) as has_spend_limit,
      (jsonb_array_length(live.ip_allowlist) > 0) as has_ip_allowlist,
      -- No request in 90 days; a new key gets 90 days before it counts as idle.
      (live.last_activity < now() - interval '90 days') as idle,
      -- Idle and never used, or idle for 180 days.
      (live.last_activity < now() - interval '90 days' and (live.never_used or live.last_activity < now() - interval '180 days')) as safe_to_remove
    from live
  )
  select
    flagged.id,
    flagged.name,
    flagged.prefix,
    flagged.status,
    flagged.created_by,
    nullif(btrim(profile.display_name), ''),
    account.email::text,
    flagged.created_at,
    case when flagged.never_used then null else flagged.last_used_at end,
    flagged.expires_at,
    flagged.storage_locations,
    flagged.has_spend_limit,
    flagged.has_ip_allowlist,
    flagged.never_used,
    flagged.idle,
    flagged.safe_to_remove,
    ((not flagged.has_spend_limit)::integer
      + (flagged.expires_at is null)::integer
      + flagged.idle::integer
      + flagged.safe_to_remove::integer
      + (not flagged.has_ip_allowlist)::integer
      + (cardinality(flagged.storage_locations) = 0)::integer) as risk
  from flagged
  left join public.users as profile on profile.user_id = flagged.created_by
  left join auth.users as account on account.id = flagged.created_by
  order by risk desc, flagged.created_at;
$function$;

COMMENT ON FUNCTION "public"."workspace_key_security"(uuid) IS 'A workspace''s live dashboard API keys with the risks the Security page reports (no spend limit, no expiry, idle, safe to remove, no IP allowlist, no storage location). Service-only; callers verify workspace access.';

GRANT EXECUTE ON FUNCTION "public"."workspace_key_security"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."workspace_key_security"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."workspace_key_security"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."workspace_key_security"(uuid) FROM PUBLIC, "anon", "authenticated";

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
    and key.name not in ('__chat_route_managed_key__', '__slack_agent_managed_key__', '__work_agent_managed_key__')
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

CREATE OR REPLACE FUNCTION public.preview_key_storage_incident (
  p_location_id         text,
  p_keys_created_before timestamp with time zone,
  p_action              text DEFAULT 'revoke'::text
)
  RETURNS TABLE (
    keys       bigint,
    workspaces bigint
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- The keys apply_key_storage_incident would change. Service-only.
  select count(*), count(distinct key.workspace_id)
  from public.keys as key
  where key.storage_locations @> array[p_location_id]
    and cardinality(key.storage_locations) > 0
    and key.created_at < p_keys_created_before
    and key.key_kind = 'standard'
    and key.status = any(case when p_action = 'pause' then array['active'] else array['active', 'paused'] end)
    and key.name not in ('__chat_route_managed_key__', '__slack_agent_managed_key__', '__work_agent_managed_key__');
$function$;

COMMENT ON FUNCTION "public"."preview_key_storage_incident"(text, timestamp with time zone, text) IS 'How many keys and workspaces a key storage incident would revoke or pause. Service-only.';

GRANT EXECUTE ON FUNCTION "public"."preview_key_storage_incident"(text, timestamp with time zone, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."preview_key_storage_incident"(text, timestamp with time zone, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."preview_key_storage_incident"(text, timestamp with time zone, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."preview_key_storage_incident"(text, timestamp with time zone, text) FROM PUBLIC, "anon", "authenticated";

