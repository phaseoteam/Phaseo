-- This is intentionally a forward migration: 20260711120000 was already
-- recorded in production before the OAuth hardening branch was merged.

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
  if p_grant_type = 'device_code' then
    update public.oauth_device_codes
    set consumed_at = now()
    where id = p_grant_id
      and consumed_at is null
      and status = 'approved'
      and expires_at > now();
  elsif p_grant_type = 'authorization_code' then
    update public.oauth_authorization_codes
    set used_at = now()
    where id = p_grant_id
      and used_at is null
      and expires_at > now();
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

revoke all on function public.consume_oauth_grant_and_issue_refresh_token(text, uuid, text, uuid, uuid, text, text[], timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.consume_oauth_grant_and_issue_refresh_token(text, uuid, text, uuid, uuid, text, text[], timestamptz, uuid) to service_role;
