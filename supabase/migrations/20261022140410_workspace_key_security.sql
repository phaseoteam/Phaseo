SET local check_function_bodies = off;

-- The Security page: risk flags for a workspace's live API keys, and overview counts.
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
      and key.name not in ('__chat_route_managed_key__', '__slack_agent_managed_key__')
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

CREATE OR REPLACE FUNCTION public.workspace_key_security_summary (
  p_workspace_id uuid
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- Counts for the Security page overview, and live keys per storage location.
  -- Service-only: callers verify workspace access first.
  with keys as (
    select * from public.workspace_key_security(p_workspace_id)
  )
  select jsonb_build_object(
    'total', count(*),
    'paused', count(*) filter (where keys.status = 'paused'),
    'no_spend_limit', count(*) filter (where not keys.has_spend_limit),
    'never_expires', count(*) filter (where keys.expires_at is null),
    'idle', count(*) filter (where keys.idle),
    'safe_to_remove', count(*) filter (where keys.safe_to_remove),
    'no_ip_allowlist', count(*) filter (where not keys.has_ip_allowlist),
    'no_storage_location', count(*) filter (where cardinality(keys.storage_locations) = 0),
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object('id', location.id, 'keys', location.keys) order by location.keys desc, location.id)
      from (
        select stored.id, count(*) as keys
        from keys, unnest(keys.storage_locations) as stored(id)
        group by stored.id
      ) as location
    ), '[]'::jsonb)
  )
  from keys;
$function$;

COMMENT ON FUNCTION "public"."workspace_key_security_summary"(uuid) IS 'Security page overview counts for a workspace''s live API keys, with live keys per storage location. Service-only; callers verify workspace access.';

GRANT EXECUTE ON FUNCTION "public"."workspace_key_security_summary"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."workspace_key_security_summary"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."workspace_key_security_summary"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."workspace_key_security_summary"(uuid) FROM PUBLIC, "anon", "authenticated";
