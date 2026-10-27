CREATE OR REPLACE FUNCTION public.issue_desktop_session_key (
  p_user_id      uuid,
  p_workspace_id uuid,
  p_key_hash     text,
  p_key_kid      text,
  p_key_prefix   text,
  p_key_name     text,
  p_resource     text,
  p_ttl_seconds  integer
)
  RETURNS timestamp with time zone
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  key_scopes constant text[] := array['gateway:access', 'models:read']::text[];
  key_expires_at timestamptz := now() + make_interval(secs => least(greatest(p_ttl_seconds, 60), 90 * 86400));
begin
  perform 1
  from public.workspace_members member
  where member.user_id = p_user_id
    and member.workspace_id = p_workspace_id
  for key share;

  if not found then
    return null;
  end if;

  -- Signing in again restores an authorisation revoked from Connected apps, with only what the app needs.
  insert into public.oauth_authorizations as authorization_row (user_id, client_id, workspace_id, scopes)
  values (p_user_id, 'phaseo_desktop', p_workspace_id, key_scopes)
  on conflict (user_id, client_id, workspace_id) do update
  set scopes = case
      when authorization_row.revoked_at is null then array(
        select distinct scope from unnest(authorization_row.scopes || key_scopes) as scope order by scope
      )
      else key_scopes
    end,
    revoked_at = null;

  -- One active desktop key per person and workspace (keys_oauth_delegated_active_idx), as an OAuth sign-in leaves it:
  -- signing in replaces the earlier key. The authorisation row is locked above, so two sign-ins at once take turns.
  update public.keys key_row
  set status = 'revoked'
  where key_row.key_kind = 'oauth_delegated'
    and key_row.oauth_user_id = p_user_id
    and key_row.workspace_id = p_workspace_id
    and key_row.oauth_client_id = 'phaseo_desktop'
    and key_row.status = 'active';

  insert into public.keys (
    workspace_id, name, hash, prefix, status, scopes, created_by, kid,
    key_kind, oauth_client_id, oauth_user_id, oauth_scopes, oauth_resource, issued_via, expires_at
  ) values (
    p_workspace_id, p_key_name, p_key_hash, p_key_prefix, 'active', '[]', p_user_id, p_key_kid,
    'oauth_delegated', 'phaseo_desktop', p_user_id, key_scopes, nullif(btrim(p_resource), ''), 'desktop', key_expires_at
  );

  return key_expires_at;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."issue_desktop_session_key"(uuid, uuid, text, text, text, text, text, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."issue_desktop_session_key"(uuid, uuid, text, text, text, text, text, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."issue_desktop_session_key"(uuid, uuid, text, text, text, text, text, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."issue_desktop_session_key"(uuid, uuid, text, text, text, text, text, integer) FROM PUBLIC, "anon", "authenticated";
