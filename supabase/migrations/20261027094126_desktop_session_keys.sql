-- The desktop app signs in to Phaseo itself, like the website and the mobile app, and gets the key for its model calls
-- from that login instead of an OAuth consent screen. The key is the same delegated key as before (client
-- phaseo_desktop, gateway:access and models:read), so the gateway, renewal, revocation and Connected apps treat it alike.
alter table public.keys drop constraint if exists keys_issued_via_check;
alter table public.keys
  add constraint keys_issued_via_check
  check (issued_via in ('dashboard', 'oauth_pkce', 'cli', 'desktop')) not valid;
alter table public.keys validate constraint keys_issued_via_check;

-- The key's expiry, or null when the person isn't a member of the workspace. Earlier desktop keys stay: each one is a
-- signed-in copy of the app (another computer, say), and each ends when it's signed out, revoked or left unrenewed.
create or replace function public.issue_desktop_session_key(
  p_user_id uuid,
  p_workspace_id uuid,
  p_key_hash text,
  p_key_kid text,
  p_key_prefix text,
  p_key_name text,
  p_resource text,
  p_ttl_seconds integer
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
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

  insert into public.keys (
    workspace_id, name, hash, prefix, status, scopes, created_by, kid,
    key_kind, oauth_client_id, oauth_user_id, oauth_scopes, oauth_resource, issued_via, expires_at
  ) values (
    p_workspace_id, p_key_name, p_key_hash, p_key_prefix, 'active', '[]', p_user_id, p_key_kid,
    'oauth_delegated', 'phaseo_desktop', p_user_id, key_scopes, nullif(btrim(p_resource), ''), 'desktop', key_expires_at
  );

  return key_expires_at;
end;
$$;

revoke all on function public.issue_desktop_session_key(uuid, uuid, text, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.issue_desktop_session_key(uuid, uuid, text, text, text, text, text, integer) to service_role;
