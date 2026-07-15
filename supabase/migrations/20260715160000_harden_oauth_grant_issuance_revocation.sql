-- Keep the authorization and workspace-membership checks in the same
-- transaction that issues or rotates a refresh token. Route-level checks are
-- still useful for clear OAuth errors, but cannot close a concurrent revoke or
-- workspace-removal race on their own.

create or replace function public.consume_oauth_grant_and_issue_refresh_token(
  p_grant_type text,
  p_grant_id uuid,
  p_token_hash text,
  p_user_id uuid,
  p_workspace_id uuid,
  p_client_id text,
  p_scopes text[],
  p_expires_at timestamptz,
  p_family_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A revocation update must serialize with issuance.
  perform 1
  from public.oauth_authorizations authorization_row
  where authorization_row.user_id = p_user_id
    and authorization_row.workspace_id = p_workspace_id
    and authorization_row.client_id = p_client_id
    and authorization_row.revoked_at is null
  for update;

  if not found then
    return 'invalid';
  end if;

  -- A membership deletion must serialize with issuance as well.
  perform 1
  from public.workspace_members member
  where member.user_id = p_user_id
    and member.workspace_id = p_workspace_id
  for key share;

  if not found then
    return 'invalid';
  end if;

  if p_grant_type = 'device_code' then
    update public.oauth_device_codes device_code
    set consumed_at = now()
    where device_code.id = p_grant_id
      and device_code.consumed_at is null
      and device_code.status = 'approved'
      and device_code.expires_at > now()
      and device_code.user_id = p_user_id
      and device_code.workspace_id = p_workspace_id
      and device_code.client_id = p_client_id;
  elsif p_grant_type = 'authorization_code' then
    update public.oauth_authorization_codes authorization_code
    set used_at = now()
    where authorization_code.id = p_grant_id
      and authorization_code.used_at is null
      and authorization_code.expires_at > now()
      and authorization_code.user_id = p_user_id
      and authorization_code.workspace_id = p_workspace_id
      and authorization_code.client_id = p_client_id;
  else
    return 'invalid';
  end if;

  if not found then
    return 'invalid';
  end if;

  insert into public.oauth_refresh_tokens (
    token_hash, user_id, workspace_id, client_id, scopes, expires_at, family_id
  ) values (
    p_token_hash, p_user_id, p_workspace_id, p_client_id, p_scopes, p_expires_at, p_family_id
  );

  return 'issued';
end;
$$;

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
  current_token public.oauth_refresh_tokens%rowtype;
  token_family uuid;
begin
  select * into current_token
  from public.oauth_refresh_tokens
  where token_hash = p_current_token_hash
  for update;

  if not found then
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

  -- Do not let an old refresh token become usable again if a grant was revoked
  -- or the user was removed from the workspace after it was issued.
  perform 1
  from public.oauth_authorizations authorization_row
  where authorization_row.user_id = current_token.user_id
    and authorization_row.workspace_id = current_token.workspace_id
    and authorization_row.client_id = current_token.client_id
    and authorization_row.revoked_at is null
  for update;

  if not found then
    update public.oauth_refresh_tokens set revoked_at = now() where family_id = token_family;
    return 'invalid';
  end if;

  perform 1
  from public.workspace_members member
  where member.user_id = current_token.user_id
    and member.workspace_id = current_token.workspace_id
  for key share;

  if not found then
    update public.oauth_refresh_tokens set revoked_at = now() where family_id = token_family;
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
    current_token.client_id, p_scopes, p_next_expires_at,
    current_token.id, token_family
  );

  return 'rotated';
end;
$$;

revoke all on function public.consume_oauth_grant_and_issue_refresh_token(text, uuid, text, uuid, uuid, text, text[], timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.consume_oauth_grant_and_issue_refresh_token(text, uuid, text, uuid, uuid, text, text[], timestamptz, uuid) to service_role;

revoke all on function public.rotate_oauth_refresh_token(text, text, timestamptz, text[]) from public, anon, authenticated;
grant execute on function public.rotate_oauth_refresh_token(text, text, timestamptz, text[]) to service_role;
