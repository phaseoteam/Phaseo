CREATE OR REPLACE FUNCTION public.consume_oauth_grant_and_issue_refresh_token (
  p_grant_type   text,
  p_grant_id     uuid,
  p_token_hash   text,
  p_user_id      uuid,
  p_workspace_id uuid,
  p_client_id    text,
  p_scopes       text[],
  p_expires_at   timestamp with time zone,
  p_family_id    uuid
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  -- Lock membership before authorization to match the member-delete trigger.
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
  for update;

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
$function$;

GRANT EXECUTE ON FUNCTION "public"."consume_oauth_grant_and_issue_refresh_token"(text, uuid, text, uuid, uuid, text, text[], timestamp WITH time zone, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."consume_oauth_grant_and_issue_refresh_token"(text, uuid, text, uuid, uuid, text, text[], timestamp WITH time zone, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."consume_oauth_grant_and_issue_refresh_token"(text, uuid, text, uuid, uuid, text, text[], timestamp WITH time zone, uuid) TO "postgres";

REVOKE ALL
  ON FUNCTION "public"."consume_oauth_grant_and_issue_refresh_token"(text, uuid, text, uuid, uuid, text, text[], timestamp WITH time zone, uuid)
  FROM PUBLIC, "anon", "authenticated";
