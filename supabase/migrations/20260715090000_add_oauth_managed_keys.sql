-- OAuth-managed credentials are ordinary gateway keys with additional
-- ownership metadata. Management keys remain in their separate table.

alter table public.keys
  add column if not exists key_kind text not null default 'standard'
    check (key_kind in ('standard', 'oauth_delegated')),
  add column if not exists oauth_client_id text,
  add column if not exists oauth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists oauth_scopes text[],
  add column if not exists issued_via text not null default 'dashboard'
    check (issued_via in ('dashboard', 'oauth_pkce', 'cli'));

create index if not exists keys_oauth_delegated_active_idx
  on public.keys (oauth_user_id, workspace_id, oauth_client_id)
  where key_kind = 'oauth_delegated' and status = 'active';

-- The Worker verifies PKCE before calling this RPC. This transaction then
-- consumes the code and creates the one durable OAuth-managed key together.
create or replace function public.consume_oauth_code_and_issue_managed_key(
  p_code_id uuid,
  p_key_hash text,
  p_key_kid text,
  p_key_prefix text,
  p_key_name text,
  p_user_id uuid,
  p_workspace_id uuid,
  p_client_id text,
  p_scopes text[]
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.oauth_authorization_codes code
  set used_at = now()
  where code.id = p_code_id
    and code.used_at is null
    and code.expires_at > now()
    and code.user_id = p_user_id
    and code.workspace_id = p_workspace_id
    and code.client_id = p_client_id
    and exists (
      select 1 from public.oauth_authorizations grant
      where grant.user_id = p_user_id
        and grant.workspace_id = p_workspace_id
        and grant.client_id = p_client_id
        and grant.revoked_at is null
    )
    and exists (
      select 1 from public.workspace_members member
      where member.user_id = p_user_id
        and member.workspace_id = p_workspace_id
    );

  if not found then
    return 'invalid';
  end if;

  update public.keys
  set status = 'revoked'
  where key_kind = 'oauth_delegated'
    and oauth_user_id = p_user_id
    and workspace_id = p_workspace_id
    and oauth_client_id = p_client_id
    and status = 'active';

  insert into public.keys (
    workspace_id, name, hash, prefix, status, scopes, created_by, kid,
    key_kind, oauth_client_id, oauth_user_id, oauth_scopes, issued_via
  ) values (
    p_workspace_id, p_key_name, p_key_hash, p_key_prefix, 'active', '[]', p_user_id, p_key_kid,
    'oauth_delegated', p_client_id, p_user_id, p_scopes, 'oauth_pkce'
  );

  return 'issued';
end;
$$;

revoke all on function public.consume_oauth_code_and_issue_managed_key(uuid, text, text, text, text, uuid, uuid, text, text[]) from public, anon, authenticated;
grant execute on function public.consume_oauth_code_and_issue_managed_key(uuid, text, text, text, text, uuid, uuid, text, text[]) to service_role;
