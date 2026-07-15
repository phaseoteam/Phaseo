-- Workspace-member deletion locks workspace_members before revoking OAuth
-- authorizations and refresh tokens. Refresh rotation must use the same global
-- order so a member cannot race rotation against removal and deadlock it.

create or replace function public.rotate_oauth_refresh_token(
  p_current_token_hash text,
  p_next_token_hash text,
  p_next_expires_at timestamptz,
  p_scopes text[]
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  token_identity public.oauth_refresh_tokens%rowtype;
  current_token public.oauth_refresh_tokens%rowtype;
  token_family uuid;
  granted_scopes text[];
begin
  -- Read identity without a row lock. Taking the token lock here would invert
  -- the member-delete trigger's membership -> authorization -> token order.
  select * into token_identity
  from public.oauth_refresh_tokens
  where token_hash = p_current_token_hash;

  if not found then
    return 'invalid';
  end if;

  perform 1
  from public.workspace_members member
  where member.user_id = token_identity.user_id
    and member.workspace_id = token_identity.workspace_id
  for key share;

  if not found then
    return 'invalid';
  end if;

  select authorization_row.scopes into granted_scopes
  from public.oauth_authorizations authorization_row
  where authorization_row.user_id = token_identity.user_id
    and authorization_row.workspace_id = token_identity.workspace_id
    and authorization_row.client_id = token_identity.client_id
    and authorization_row.revoked_at is null
  for update;

  if not found then
    return 'invalid';
  end if;

  -- Re-read and validate after acquiring locks because another rotation may
  -- have changed this token between the initial identity read and this lock.
  select * into current_token
  from public.oauth_refresh_tokens
  where token_hash = p_current_token_hash
  for update;

  if not found
    or current_token.user_id <> token_identity.user_id
    or current_token.workspace_id <> token_identity.workspace_id
    or current_token.client_id <> token_identity.client_id then
    return 'invalid';
  end if;

  token_family := coalesce(current_token.family_id, current_token.id);

  if current_token.revoked_at is not null then
    update public.oauth_refresh_tokens
    set revoked_at = coalesce(revoked_at, now())
    where family_id = token_family;
    return 'reused';
  end if;

  if current_token.expires_at is not null and current_token.expires_at <= now() then
    update public.oauth_refresh_tokens set revoked_at = now() where id = current_token.id;
    return 'invalid';
  end if;

  update public.oauth_refresh_tokens
  set revoked_at = now(), last_used_at = now()
  where id = current_token.id;

  insert into public.oauth_refresh_tokens (
    token_hash, user_id, workspace_id, client_id, scopes, expires_at,
    rotated_from, family_id
  ) values (
    p_next_token_hash, current_token.user_id, current_token.workspace_id,
    current_token.client_id, granted_scopes, p_next_expires_at,
    current_token.id, token_family
  );

  return 'rotated';
end;
$$;

revoke all on function public.rotate_oauth_refresh_token(text, text, timestamptz, text[]) from public, anon, authenticated;
grant execute on function public.rotate_oauth_refresh_token(text, text, timestamptz, text[]) to service_role;
