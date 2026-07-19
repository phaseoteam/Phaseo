-- A delegated credential bound to the Phaseo Gateway API is still capable of
-- billable inference. Require the explicit gateway:access grant at the storage
-- boundary as well as in the API authorization checks.

-- Revoke any credential minted during the vulnerable deployment window before
-- tightening the constraint. Runtime authorization also rejects these keys.
update public.keys
set status = 'revoked'
where key_kind = 'oauth_delegated'
  and status = 'active'
  and coalesce(btrim(oauth_resource) ~* '^https://api\.phaseo\.app(?::443)?/v1/*$', false)
  and not (coalesce(oauth_scopes, array[]::text[]) @> array['gateway:access']::text[]);

alter table public.keys
  drop constraint if exists keys_active_oauth_delegated_gateway_scope_check;

alter table public.keys
  add constraint keys_active_oauth_delegated_gateway_scope_check
  check (
    key_kind <> 'oauth_delegated'
    or status <> 'active'
    or (
      nullif(btrim(oauth_resource), '') is not null
      and not coalesce(btrim(oauth_resource) ~* '^https://api\.phaseo\.app(?::443)?/v1/*$', false)
    )
    or coalesce(oauth_scopes, array[]::text[]) @> array['gateway:access']::text[]
  ) not valid;

alter table public.keys
  validate constraint keys_active_oauth_delegated_gateway_scope_check;

create or replace function public.consume_oauth_code_and_issue_managed_key(
  p_code_id uuid,
  p_key_hash text,
  p_key_kid text,
  p_key_prefix text,
  p_key_name text,
  p_user_id uuid,
  p_workspace_id uuid,
  p_client_id text,
  p_scopes text[],
  p_resource text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  granted_scopes text[];
  granted_resource text;
  resource_is_gateway boolean;
begin
  resource_is_gateway := coalesce(
    btrim(p_resource) ~* '^https://api\.phaseo\.app(?::443)?/v1/*$',
    false
  );

  -- Unbound and Gateway-bound credentials both authorize billable API use.
  if (nullif(btrim(p_resource), '') is null or resource_is_gateway)
    and not (coalesce(p_scopes, array[]::text[]) @> array['gateway:access']::text[])
  then
    return 'invalid';
  end if;

  perform 1
  from public.workspace_members member
  where member.user_id = p_user_id
    and member.workspace_id = p_workspace_id
  for key share;

  if not found then
    return 'invalid';
  end if;

  perform 1
  from public.oauth_authorizations authorization_row
  where authorization_row.user_id = p_user_id
    and authorization_row.workspace_id = p_workspace_id
    and authorization_row.client_id = p_client_id
    and authorization_row.revoked_at is null
    and coalesce(authorization_row.scopes, array[]::text[]) @> coalesce(p_scopes, array[]::text[])
    and (
      (nullif(btrim(p_resource), '') is not null and not resource_is_gateway)
      or coalesce(authorization_row.scopes, array[]::text[]) @> array['gateway:access']::text[]
    )
  for update;

  if not found then
    return 'invalid';
  end if;

  update public.oauth_authorization_codes authorization_code
  set used_at = now()
  where authorization_code.id = p_code_id
    and authorization_code.used_at is null
    and authorization_code.expires_at > now()
    and authorization_code.user_id = p_user_id
    and authorization_code.workspace_id = p_workspace_id
    and authorization_code.client_id = p_client_id
    and authorization_code.resource is not distinct from nullif(btrim(p_resource), '')
    and (
      (authorization_code.resource is not null and not resource_is_gateway)
      or coalesce(authorization_code.scopes, array[]::text[]) @> array['gateway:access']::text[]
    )
    and coalesce(authorization_code.scopes, array[]::text[]) <@ coalesce(p_scopes, array[]::text[])
    and coalesce(p_scopes, array[]::text[]) <@ coalesce(authorization_code.scopes, array[]::text[])
  returning authorization_code.scopes, authorization_code.resource
    into granted_scopes, granted_resource;

  if not found then
    return 'invalid';
  end if;

  update public.keys
  set status = 'revoked'
  where key_kind = 'oauth_delegated'
    and oauth_user_id = p_user_id
    and workspace_id = p_workspace_id
    and oauth_client_id = p_client_id
    and oauth_resource is not distinct from granted_resource
    and status = 'active';

  insert into public.keys (
    workspace_id, name, hash, prefix, status, scopes, created_by, kid,
    key_kind, oauth_client_id, oauth_user_id, oauth_scopes, oauth_resource, issued_via, expires_at
  ) values (
    p_workspace_id, p_key_name, p_key_hash, p_key_prefix, 'active', '[]', p_user_id, p_key_kid,
    'oauth_delegated', p_client_id, p_user_id, granted_scopes, granted_resource, 'oauth_pkce', now() + interval '7 days'
  );

  return 'issued';
end;
$$;

revoke all on function public.consume_oauth_code_and_issue_managed_key(uuid, text, text, text, text, uuid, uuid, text, text[], text) from public, anon, authenticated;
grant execute on function public.consume_oauth_code_and_issue_managed_key(uuid, text, text, text, text, uuid, uuid, text, text[], text) to service_role;
