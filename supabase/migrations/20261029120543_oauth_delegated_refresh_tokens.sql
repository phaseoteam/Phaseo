-- Refresh tokens for third-party OAuth apps' delegated gateway keys.
-- * oauth_refresh_tokens.key_id: the delegated key a refresh token renews (deleted with the key).
-- * public.consume_oauth_code_and_issue_delegated_grant: the authorization-code exchange now issues
--   the delegated key (the 7-day access token) and a 90-day refresh token bound to it, atomically.
--   consume_oauth_code_and_issue_managed_key stays for Workers deployed before this change.
-- * public.rotate_oauth_delegated_refresh_token: refreshing rotates the refresh token and replaces
--   the same key's secret (the old access token stops working at once), never widens scopes, and a
--   refresh token presented again after rotation revokes its chain and the key.
-- * Triggers: a delegated key that stops being active ends its refresh tokens; revoking or deleting
--   an app's authorization revokes that app's delegated keys and refresh tokens in the workspace.
-- Hand-written: the declarative sync needs a local Postgres runtime (Docker), which is not
-- available where this was authored. It matches the definitions in schemas/.
SET local check_function_bodies = off;

ALTER TABLE "public"."oauth_refresh_tokens"
  ADD COLUMN "key_id" uuid;

ALTER TABLE "public"."oauth_refresh_tokens"
  ADD CONSTRAINT "oauth_refresh_tokens_key_id_fkey" FOREIGN KEY (key_id) REFERENCES public.keys(id) ON DELETE CASCADE;

CREATE INDEX oauth_refresh_tokens_key_idx ON public.oauth_refresh_tokens USING btree (key_id)
  WHERE (key_id IS NOT NULL);

COMMENT ON COLUMN "public"."oauth_refresh_tokens"."key_id" IS 'The delegated gateway key a third-party app''s refresh token renews. Refreshing rotates that key''s secret; revoking, disabling or deleting the key ends its refresh tokens. NULL for tokens that renew a session JWT (the Phaseo CLI).';

CREATE OR REPLACE FUNCTION public.consume_oauth_code_and_issue_delegated_grant (
  p_code_id              uuid,
  p_key_hash             text,
  p_key_kid              text,
  p_key_prefix           text,
  p_key_name             text,
  p_user_id              uuid,
  p_workspace_id         uuid,
  p_client_id            text,
  p_scopes               text[],
  p_resource             text,
  p_refresh_token_hash   text,
  p_refresh_expires_at   timestamp with time zone
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  granted_scopes text[];
  granted_resource text;
  resource_is_gateway boolean;
  issued_key_id uuid;
begin
  if nullif(btrim(p_refresh_token_hash), '') is null or p_refresh_expires_at is null then
    return 'invalid';
  end if;

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

  -- The new sign-in replaces the app's earlier key here; revoking it also ends that key's
  -- refresh tokens (revoke_oauth_refresh_tokens_for_inactive_key).
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
  )
  returning id into issued_key_id;

  -- The refresh token renews this key (same row, new secret) until it is revoked or unused for 90 days.
  insert into public.oauth_refresh_tokens (
    token_hash, user_id, workspace_id, client_id, scopes, expires_at, family_id, key_id
  ) values (
    p_refresh_token_hash, p_user_id, p_workspace_id, p_client_id, granted_scopes, p_refresh_expires_at,
    gen_random_uuid(), issued_key_id
  );

  return 'issued';
end;
$function$;

COMMENT ON FUNCTION "public"."consume_oauth_code_and_issue_delegated_grant"(uuid, text, text, text, text, uuid, uuid, text, text[], text, text, timestamp WITH time zone) IS 'Exchanges a third-party OAuth authorization code for a delegated gateway key (the access token, 7 days) and a refresh token bound to that key (90 days, rotated by rotate_oauth_delegated_refresh_token), in one transaction. Returns issued or invalid.';

GRANT EXECUTE ON FUNCTION "public"."consume_oauth_code_and_issue_delegated_grant"(uuid, text, text, text, text, uuid, uuid, text, text[], text, text, timestamp WITH time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."consume_oauth_code_and_issue_delegated_grant"(uuid, text, text, text, text, uuid, uuid, text, text[], text, text, timestamp WITH time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."consume_oauth_code_and_issue_delegated_grant"(uuid, text, text, text, text, uuid, uuid, text, text[], text, text, timestamp WITH time zone) TO "postgres";

REVOKE ALL
  ON FUNCTION "public"."consume_oauth_code_and_issue_delegated_grant"(uuid, text, text, text, text, uuid, uuid, text, text[], text, text, timestamp WITH time zone)
  FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.rotate_oauth_delegated_refresh_token (
  p_current_token_hash text,
  p_next_token_hash    text,
  p_next_expires_at    timestamp with time zone,
  p_key_hash           text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  token_identity public.oauth_refresh_tokens%rowtype;
  current_token public.oauth_refresh_tokens%rowtype;
  delegated_key public.keys%rowtype;
  granted_scopes text[];
  resource_is_gateway boolean;
  key_expires_at timestamp with time zone := now() + interval '7 days';
begin
  if nullif(btrim(p_next_token_hash), '') is null or nullif(btrim(p_key_hash), '') is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- Read identity without a row lock, then lock in the member-delete trigger's order:
  -- membership -> authorization -> key -> token.
  select * into token_identity
  from public.oauth_refresh_tokens
  where token_hash = p_current_token_hash;

  if not found or token_identity.key_id is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  perform 1
  from public.workspace_members member
  where member.user_id = token_identity.user_id
    and member.workspace_id = token_identity.workspace_id
  for key share;

  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  select authorization_row.scopes into granted_scopes
  from public.oauth_authorizations authorization_row
  where authorization_row.user_id = token_identity.user_id
    and authorization_row.workspace_id = token_identity.workspace_id
    and authorization_row.client_id = token_identity.client_id
    and authorization_row.revoked_at is null
  for update;

  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  select * into delegated_key
  from public.keys key_row
  where key_row.id = token_identity.key_id
  for update;

  if not found then
    return jsonb_build_object('status', 'invalid');
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
    or current_token.client_id <> token_identity.client_id
    or current_token.key_id is distinct from token_identity.key_id then
    return jsonb_build_object('status', 'invalid');
  end if;

  if current_token.revoked_at is not null then
    update public.oauth_refresh_tokens
    set revoked_at = coalesce(revoked_at, now())
    where family_id = current_token.family_id;

    -- Presented again after it was rotated (only rotation sets last_used_at), the token may
    -- have leaked: end the key it renews too. A token revoked any other way just fails.
    if current_token.last_used_at is not null then
      update public.keys
      set status = 'revoked', revoked_reason = 'oauth_refresh_token_reused'
      where id = delegated_key.id
        and status = 'active';
      return jsonb_build_object('status', 'reused');
    end if;
    return jsonb_build_object('status', 'invalid');
  end if;

  if current_token.expires_at is not null and current_token.expires_at <= now() then
    update public.oauth_refresh_tokens set revoked_at = now() where id = current_token.id;
    return jsonb_build_object('status', 'invalid');
  end if;

  -- Revoking, disabling or deleting the key ends its refresh tokens; a refresh never revives it.
  if delegated_key.status <> 'active'
    or delegated_key.key_kind <> 'oauth_delegated'
    or delegated_key.oauth_user_id is distinct from current_token.user_id
    or delegated_key.workspace_id <> current_token.workspace_id
    or delegated_key.oauth_client_id is distinct from current_token.client_id then
    update public.oauth_refresh_tokens
    set revoked_at = coalesce(revoked_at, now())
    where family_id = current_token.family_id;
    return jsonb_build_object('status', 'invalid');
  end if;

  -- Never widen on refresh: keep the scopes this token and its key already hold that the
  -- authorization still grants.
  granted_scopes := array(
    select scope from unnest(coalesce(granted_scopes, array[]::text[])) as scope
    where scope = any(current_token.scopes)
      and scope = any(coalesce(delegated_key.oauth_scopes, array[]::text[]))
  );

  resource_is_gateway := coalesce(
    btrim(delegated_key.oauth_resource) ~* '^https://api\.phaseo\.app(?::443)?/v1/*$',
    false
  );

  -- An unbound or Gateway-bound key spends credits, so it needs gateway:access consent.
  if coalesce(cardinality(granted_scopes), 0) = 0
    or (
      (nullif(btrim(delegated_key.oauth_resource), '') is null or resource_is_gateway)
      and not (granted_scopes @> array['gateway:access']::text[])
    ) then
    return jsonb_build_object('status', 'invalid');
  end if;

  update public.oauth_refresh_tokens
  set revoked_at = now(), last_used_at = now()
  where id = current_token.id;

  insert into public.oauth_refresh_tokens (
    token_hash, user_id, workspace_id, client_id, scopes, expires_at,
    rotated_from, family_id, key_id
  ) values (
    p_next_token_hash, current_token.user_id, current_token.workspace_id,
    current_token.client_id, granted_scopes, p_next_expires_at,
    current_token.id, current_token.family_id, current_token.key_id
  );

  -- Same key row, new secret: the previous access token stops working now, and the key's
  -- limits, history and Settings entry carry over.
  update public.keys
  set hash = p_key_hash,
    oauth_scopes = granted_scopes,
    expires_at = key_expires_at
  where id = delegated_key.id;

  return jsonb_build_object(
    'status', 'rotated',
    'kid', delegated_key.kid,
    'scopes', to_jsonb(granted_scopes),
    'resource', delegated_key.oauth_resource,
    'expires_at', key_expires_at
  );
end;
$function$;

COMMENT ON FUNCTION "public"."rotate_oauth_delegated_refresh_token"(text, text, timestamp WITH time zone, text) IS 'Refreshes a third-party app''s delegated gateway key: rotates the refresh token and replaces the same key''s secret, extending it 7 days. Scopes only narrow. A reused refresh token revokes its chain and the key. Returns {status: rotated|reused|invalid, ...}.';

GRANT EXECUTE ON FUNCTION "public"."rotate_oauth_delegated_refresh_token"(text, text, timestamp WITH time zone, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."rotate_oauth_delegated_refresh_token"(text, text, timestamp WITH time zone, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."rotate_oauth_delegated_refresh_token"(text, text, timestamp WITH time zone, text) TO "postgres";

REVOKE ALL
  ON FUNCTION "public"."rotate_oauth_delegated_refresh_token"(text, text, timestamp WITH time zone, text)
  FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.revoke_oauth_refresh_tokens_for_inactive_key()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  update public.oauth_refresh_tokens
  set revoked_at = coalesce(revoked_at, now())
  where key_id = new.id
    and revoked_at is null;

  return new;
end;
$function$;

COMMENT ON FUNCTION "public"."revoke_oauth_refresh_tokens_for_inactive_key"() IS 'Ends the refresh tokens of a delegated OAuth key once it is revoked, disabled, paused or deleted, so the app cannot renew it. Turning the key back on does not revive them.';

REVOKE ALL ON FUNCTION "public"."revoke_oauth_refresh_tokens_for_inactive_key"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."revoke_oauth_refresh_tokens_for_inactive_key"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."revoke_oauth_refresh_tokens_for_inactive_key"() FROM PUBLIC, "anon", "authenticated", "service_role";

CREATE OR REPLACE FUNCTION public.revoke_oauth_grant_on_authorization_revoke()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  -- Same order as the member-delete trigger: authorization -> keys -> refresh tokens.
  update public.keys
  set status = 'revoked'
  where key_kind = 'oauth_delegated'
    and oauth_user_id = old.user_id
    and workspace_id = old.workspace_id
    and oauth_client_id = old.client_id
    and status = 'active';

  update public.oauth_refresh_tokens
  set revoked_at = coalesce(revoked_at, now())
  where user_id = old.user_id
    and workspace_id = old.workspace_id
    and client_id = old.client_id
    and revoked_at is null;

  return null;
end;
$function$;

COMMENT ON FUNCTION "public"."revoke_oauth_grant_on_authorization_revoke"() IS 'When someone revokes or deletes an app''s authorization, revokes that app''s delegated keys and refresh tokens in the workspace, so authorizing the app again later never revives them.';

REVOKE ALL ON FUNCTION "public"."revoke_oauth_grant_on_authorization_revoke"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."revoke_oauth_grant_on_authorization_revoke"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."revoke_oauth_grant_on_authorization_revoke"() FROM PUBLIC, "anon", "authenticated", "service_role";

CREATE TRIGGER revoke_oauth_refresh_tokens_for_inactive_key
  AFTER UPDATE OF status ON public.keys
  FOR EACH ROW
  WHEN (((old.status = 'active'::text) AND (new.status IS DISTINCT FROM 'active'::text) AND (new.key_kind = 'oauth_delegated'::text)))
  EXECUTE FUNCTION public.revoke_oauth_refresh_tokens_for_inactive_key();

CREATE TRIGGER revoke_oauth_grant_on_authorization_delete
  AFTER DELETE ON public.oauth_authorizations
  FOR EACH ROW
  EXECUTE FUNCTION public.revoke_oauth_grant_on_authorization_revoke();

CREATE TRIGGER revoke_oauth_grant_on_authorization_revoke
  AFTER UPDATE OF revoked_at ON public.oauth_authorizations
  FOR EACH ROW
  WHEN (((old.revoked_at IS NULL) AND (new.revoked_at IS NOT NULL)))
  EXECUTE FUNCTION public.revoke_oauth_grant_on_authorization_revoke();
