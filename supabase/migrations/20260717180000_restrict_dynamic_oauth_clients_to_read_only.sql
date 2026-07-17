-- Dynamically registered MCP clients are unverified and must remain read-only.
-- Developer-owned applications use oauth_app_metadata and are unaffected.

with dynamic_clients as (
  select id
  from public.oauth_clients
  where not is_first_party
), restricted_clients as (
  update public.oauth_clients client
  set allowed_scopes = coalesce((
    select array_agg(scope order by ordinal)
    from unnest(client.allowed_scopes) with ordinality as requested(scope, ordinal)
    where scope = any(array[
      'openid', 'profile', 'email', 'me:read', 'models:read',
      'providers:read', 'pricing:read', 'credits:read', 'activity:read',
      'analytics:read', 'generations:read', 'workspaces:read', 'keys:read',
      'presets:read', 'settings:read', 'guardrails:read',
      'management_keys:read', 'oauth_clients:read'
    ]::text[])
  ), array[]::text[]),
  updated_at = now()
  where client.id in (select id from dynamic_clients)
  returning client.id
)
update public.oauth_authorizations authorization
set revoked_at = coalesce(authorization.revoked_at, now())
where authorization.client_id in (select id from restricted_clients)
  and exists (
    select 1
    from unnest(coalesce(authorization.scopes, array[]::text[])) scope
    where scope = 'gateway:access' or scope ~ ':(write|delete)$'
  );

update public.oauth_authorization_codes code
set used_at = coalesce(code.used_at, now())
where code.client_id in (select id from public.oauth_clients where not is_first_party)
  and exists (
    select 1
    from unnest(coalesce(code.scopes, array[]::text[])) scope
    where scope = 'gateway:access' or scope ~ ':(write|delete)$'
  );

update public.oauth_refresh_tokens token
set revoked_at = coalesce(token.revoked_at, now())
where token.client_id in (select id from public.oauth_clients where not is_first_party)
  and exists (
    select 1
    from unnest(coalesce(token.scopes, array[]::text[])) scope
    where scope = 'gateway:access' or scope ~ ':(write|delete)$'
  );

update public.keys delegated_key
set status = 'revoked'
where delegated_key.key_kind = 'oauth_delegated'
  and delegated_key.status = 'active'
  and delegated_key.oauth_client_id in (select id from public.oauth_clients where not is_first_party)
  and exists (
    select 1
    from unnest(coalesce(delegated_key.oauth_scopes, array[]::text[])) scope
    where scope = 'gateway:access' or scope ~ ':(write|delete)$'
  );
