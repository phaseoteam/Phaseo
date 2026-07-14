-- Revoke workspace-scoped OAuth access as part of membership removal and make
-- refresh-token rotation atomic with family replay detection.

alter table public.oauth_device_codes
  add column if not exists last_polled_at timestamptz;

create or replace function public.enforce_oauth_device_poll_interval(p_device_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  device public.oauth_device_codes%rowtype;
begin
  select * into device
  from public.oauth_device_codes
  where id = p_device_id
  for update;

  if not found then return 'invalid'; end if;

  if device.last_polled_at is not null
     and device.last_polled_at + make_interval(secs => device.interval_seconds) > now() then
    update public.oauth_device_codes
    set last_polled_at = now(), interval_seconds = interval_seconds + 5
    where id = p_device_id;
    return 'slow_down';
  end if;

  update public.oauth_device_codes set last_polled_at = now() where id = p_device_id;
  return 'ok';
end;
$$;

revoke all on function public.enforce_oauth_device_poll_interval(uuid) from public, anon, authenticated;
grant execute on function public.enforce_oauth_device_poll_interval(uuid) to service_role;

create or replace function public.revoke_oauth_on_workspace_member_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.oauth_authorizations
  set revoked_at = coalesce(revoked_at, now())
  where user_id = old.user_id
    and workspace_id = old.workspace_id
    and revoked_at is null;

  update public.oauth_refresh_tokens
  set revoked_at = coalesce(revoked_at, now())
  where user_id = old.user_id
    and workspace_id = old.workspace_id
    and revoked_at is null;

  return old;
end;
$$;

drop trigger if exists revoke_oauth_on_workspace_member_delete on public.workspace_members;
create trigger revoke_oauth_on_workspace_member_delete
after delete on public.workspace_members
for each row execute function public.revoke_oauth_on_workspace_member_delete();

revoke all on function public.revoke_oauth_on_workspace_member_delete() from public, anon, authenticated;

alter table public.oauth_refresh_tokens
  add column if not exists family_id uuid;

update public.oauth_refresh_tokens
set family_id = id
where family_id is null;

alter table public.oauth_refresh_tokens
  add constraint oauth_refresh_tokens_family_id_present check (family_id is not null) not valid;

alter table public.oauth_refresh_tokens
  validate constraint oauth_refresh_tokens_family_id_present;

alter table public.oauth_refresh_tokens
  alter column family_id set not null;

create index concurrently if not exists oauth_refresh_tokens_family_idx
  on public.oauth_refresh_tokens(family_id);

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

revoke all on function public.rotate_oauth_refresh_token(text, text, timestamptz, text[]) from public, anon, authenticated;
grant execute on function public.rotate_oauth_refresh_token(text, text, timestamptz, text[]) to service_role;

create or replace function public.cleanup_expired_oauth_artifacts()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.oauth_authorization_codes where expires_at < now() - interval '1 hour';
  delete from public.oauth_device_codes where expires_at < now() - interval '1 hour';
  delete from public.oauth_refresh_tokens token
  where token.expires_at < now() - interval '1 day'
    and not exists (
      select 1 from public.oauth_refresh_tokens child
      where child.rotated_from = token.id
    );
end;
$$;

revoke all on function public.cleanup_expired_oauth_artifacts() from public, anon, authenticated;
grant execute on function public.cleanup_expired_oauth_artifacts() to service_role;
