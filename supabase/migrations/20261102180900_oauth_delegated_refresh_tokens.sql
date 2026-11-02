SET local check_function_bodies = off;

ALTER TABLE "public"."oauth_refresh_tokens"
  ADD COLUMN "key_id" uuid;

ALTER TABLE "public"."oauth_refresh_tokens"
  ADD COLUMN "revoked_reason" text;

CREATE OR REPLACE FUNCTION public.consume_oauth_code_and_issue_delegated_grant (
  p_code_id            uuid,
  p_key_hash           text,
  p_key_kid            text,
  p_key_prefix         text,
  p_key_name           text,
  p_user_id            uuid,
  p_workspace_id       uuid,
  p_client_id          text,
  p_scopes             text[],
  p_resource           text,
  p_refresh_token_hash text,
  p_refresh_expires_at timestamp with time zone
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  granted_scopes text[];
  granted_resource text;
  resource_is_gateway boolean;
  existing_key public.keys%rowtype;
  issued_key_id uuid;
  issued_kid text;
  outcome text;
begin
  if nullif(btrim(p_refresh_token_hash), '') is null or p_refresh_expires_at is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  resource_is_gateway := coalesce(
    btrim(p_resource) ~* '^https://api\.phaseo\.app(?::443)?/v1/*$',
    false
  );

  -- Unbound and Gateway-bound credentials both authorize billable API use.
  if (nullif(btrim(p_resource), '') is null or resource_is_gateway)
    and not (coalesce(p_scopes, array[]::text[]) @> array['gateway:access']::text[])
  then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- Lock order, as in both refresh-token rotations, revoke_oauth_refresh_token_grant and the
  -- member-delete trigger: membership -> authorization -> key -> refresh tokens.
  perform 1
  from public.workspace_members member
  where member.user_id = p_user_id
    and member.workspace_id = p_workspace_id
  for key share;

  if not found then
    return jsonb_build_object('status', 'invalid');
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
    return jsonb_build_object('status', 'invalid');
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
    return jsonb_build_object('status', 'invalid');
  end if;

  -- Approving the same app again renews its key instead of adding one, so the key keeps its id,
  -- limits, month-to-date spend and history. Revoked, compromised and deleted keys are final.
  select * into existing_key
  from public.keys key_row
  where key_row.key_kind = 'oauth_delegated'
    and key_row.issued_via = 'oauth_pkce'
    and key_row.oauth_user_id = p_user_id
    and key_row.workspace_id = p_workspace_id
    and key_row.oauth_client_id = p_client_id
    and key_row.oauth_resource is not distinct from granted_resource
    and key_row.status not in ('revoked', 'compromised', 'deleted')
  order by (key_row.status = 'active') desc, key_row.created_at desc
  limit 1
  for update;

  if found then
    -- A key an owner or admin paused (or a storage incident paused) is never turned back on by
    -- signing in again. The code is spent; nothing usable is issued.
    if existing_key.status <> 'active' then
      return jsonb_build_object('status', 'key_inactive');
    end if;

    -- Every earlier sign-in's refresh-token family is retired here, spent tokens included, and the
    -- new secret ends its access token. Presenting a retired token later is just refused, never
    -- treated as reuse, so it can't end this key or the family issued below.
    update public.oauth_refresh_tokens
    set revoked_at = coalesce(revoked_at, now()), revoked_reason = 'superseded'
    where key_id = existing_key.id
      and revoked_reason is null;

    update public.keys
    set hash = p_key_hash,
      oauth_scopes = granted_scopes,
      expires_at = now() + interval '7 days'
    where id = existing_key.id;

    issued_key_id := existing_key.id;
    issued_kid := existing_key.kid;
    outcome := 'renewed';
  else
    insert into public.keys (
      workspace_id, name, hash, prefix, status, scopes, created_by, kid,
      key_kind, oauth_client_id, oauth_user_id, oauth_scopes, oauth_resource, issued_via, expires_at
    ) values (
      p_workspace_id, p_key_name, p_key_hash, p_key_prefix, 'active', '[]', p_user_id, p_key_kid,
      'oauth_delegated', p_client_id, p_user_id, granted_scopes, granted_resource, 'oauth_pkce', now() + interval '7 days'
    )
    returning id, kid into issued_key_id, issued_kid;
    outcome := 'issued';
  end if;

  -- The refresh token renews this key (same row, new secret) until it is revoked or unused for 90 days.
  insert into public.oauth_refresh_tokens (
    token_hash, user_id, workspace_id, client_id, scopes, expires_at, family_id, key_id
  ) values (
    p_refresh_token_hash, p_user_id, p_workspace_id, p_client_id, granted_scopes, p_refresh_expires_at,
    gen_random_uuid(), issued_key_id
  );

  return jsonb_build_object('status', outcome, 'kid', issued_kid);
end;
$function$;

REVOKE ALL
  ON FUNCTION "public"."consume_oauth_code_and_issue_delegated_grant"(uuid, text, text, text, text, uuid, uuid, text, text[], text, text, timestamp WITH time zone)
  FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.revoke_oauth_delegated_refresh_on_scope_loss()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  -- Runs while this update holds the authorization row, which a refresh locks first, so no refresh
  -- can slip in between. The same test as rotate_oauth_delegated_refresh_token: nothing left in
  -- common, or a credit-spending key without gateway:access, ends the token's chain for good.
  update public.oauth_refresh_tokens refresh_token
  set revoked_at = now()
  from public.keys key_row
  where key_row.id = refresh_token.key_id
    and refresh_token.user_id = new.user_id
    and refresh_token.workspace_id = new.workspace_id
    and refresh_token.client_id = new.client_id
    and refresh_token.revoked_at is null
    and (
      not exists (
        select 1
        from unnest(coalesce(new.scopes, array[]::text[])) as scope
        where scope = any(refresh_token.scopes)
          and scope = any(coalesce(key_row.oauth_scopes, array[]::text[]))
      )
      or (
        (
          nullif(btrim(key_row.oauth_resource), '') is null
          or coalesce(btrim(key_row.oauth_resource) ~* '^https://api\.phaseo\.app(?::443)?/v1/*$', false)
        )
        and not (coalesce(new.scopes, array[]::text[]) @> array['gateway:access']::text[])
      )
    );

  return null;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."revoke_oauth_delegated_refresh_on_scope_loss"() FROM PUBLIC, "anon", "authenticated", "service_role";

CREATE OR REPLACE FUNCTION public.revoke_oauth_grant_on_authorization_revoke()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  -- Same order as the member-delete trigger: authorization -> keys -> refresh tokens. Paused and
  -- disabled keys are revoked too, so turning one back on can't bring back the app's access.
  update public.keys
  set status = 'revoked'
  where key_kind = 'oauth_delegated'
    and oauth_user_id = old.user_id
    and workspace_id = old.workspace_id
    and oauth_client_id = old.client_id
    and status not in ('revoked', 'compromised', 'deleted');

  update public.oauth_refresh_tokens
  set revoked_at = coalesce(revoked_at, now())
  where user_id = old.user_id
    and workspace_id = old.workspace_id
    and client_id = old.client_id
    and revoked_at is null;

  return null;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."revoke_oauth_grant_on_authorization_revoke"() FROM PUBLIC, "anon", "authenticated", "service_role";

CREATE OR REPLACE FUNCTION public.revoke_oauth_refresh_token_grant (
  p_token_hashes text[]
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  token_identity public.oauth_refresh_tokens%rowtype;
  current_token public.oauth_refresh_tokens%rowtype;
begin
  -- Any token of the grant identifies it, even one already rotated, so a logout that races a
  -- refresh still ends the token that refresh issued. Read it without a row lock.
  select * into token_identity
  from public.oauth_refresh_tokens
  where token_hash = any(coalesce(p_token_hashes, array[]::text[]))
  limit 1;

  if not found then
    return 'not_found';
  end if;

  -- Lock in the order every OAuth grant change uses (the member-delete trigger, the code exchange,
  -- both refresh-token rotations): membership -> authorization -> key -> refresh tokens. Holding
  -- the authorization first waits out any refresh, renewal or replay of this grant in flight, so
  -- this never holds a token lock one of them is waiting for, and the updates below see the
  -- tokens it committed.
  perform 1
  from public.workspace_members member
  where member.user_id = token_identity.user_id
    and member.workspace_id = token_identity.workspace_id
  for key share;

  perform 1
  from public.oauth_authorizations authorization_row
  where authorization_row.user_id = token_identity.user_id
    and authorization_row.workspace_id = token_identity.workspace_id
    and authorization_row.client_id = token_identity.client_id
  for update;

  if token_identity.key_id is null then
    update public.oauth_refresh_tokens
    set revoked_at = now()
    where family_id = token_identity.family_id
      and revoked_at is null;
    return 'revoked';
  end if;

  perform 1
  from public.keys key_row
  where key_row.id = token_identity.key_id
  for update;

  select * into current_token
  from public.oauth_refresh_tokens
  where id = token_identity.id;

  -- Approving the app again retired this token's family and renewed the key with a new one. That
  -- sign-in is already over, and its token doesn't speak for the one that replaced it.
  if not found or current_token.revoked_reason = 'superseded' then
    return 'revoked';
  end if;

  update public.oauth_refresh_tokens
  set revoked_at = now()
  where (key_id = token_identity.key_id or family_id = token_identity.family_id)
    and revoked_at is null;

  -- The app gave up its access: end its delegated key too, even a paused one.
  update public.keys
  set status = 'revoked', revoked_reason = 'oauth_token_revoked'
  where id = token_identity.key_id
    and key_kind = 'oauth_delegated'
    and status not in ('revoked', 'compromised', 'deleted');

  return 'revoked';
end;
$function$;

REVOKE ALL ON FUNCTION "public"."revoke_oauth_refresh_token_grant"(text[]) FROM PUBLIC, "anon", "authenticated";

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

REVOKE ALL ON FUNCTION "public"."revoke_oauth_refresh_tokens_for_inactive_key"() FROM PUBLIC, "anon", "authenticated", "service_role";

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

  -- Read identity without a row lock, then lock in the order every OAuth grant change uses (the
  -- member-delete trigger, the code exchange, revoke_oauth_refresh_token_grant):
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
    -- Approving the app again retired this token's family and renewed the key with a new one. That
    -- sign-in is over, so its token is just refused: the key and the family that replaced it stay.
    if current_token.revoked_reason = 'superseded' then
      return jsonb_build_object('status', 'invalid');
    end if;

    update public.oauth_refresh_tokens
    set revoked_at = coalesce(revoked_at, now())
    where family_id = current_token.family_id;

    -- Presented again after it was rotated (only rotation sets last_used_at), the token may
    -- have leaked: end the key it renews too, even a paused one, so turning it back on can't
    -- revive it. A token revoked any other way just fails.
    if current_token.last_used_at is not null then
      update public.keys
      set status = 'revoked', revoked_reason = 'oauth_refresh_token_reused'
      where id = delegated_key.id
        and status not in ('revoked', 'compromised', 'deleted');
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

  -- An unbound or Gateway-bound key spends credits, so it needs gateway:access consent. Losing a
  -- required scope ends the chain for good, so consenting to the scope again doesn't revive it.
  if coalesce(cardinality(granted_scopes), 0) = 0
    or (
      (nullif(btrim(delegated_key.oauth_resource), '') is null or resource_is_gateway)
      and not (granted_scopes @> array['gateway:access']::text[])
    ) then
    update public.oauth_refresh_tokens
    set revoked_at = coalesce(revoked_at, now())
    where family_id = current_token.family_id;
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

REVOKE ALL ON FUNCTION "public"."rotate_oauth_delegated_refresh_token"(text, text, timestamp WITH time zone, text) FROM PUBLIC, "anon", "authenticated";

ALTER TABLE "public"."oauth_refresh_tokens"
  ADD CONSTRAINT "oauth_refresh_tokens_key_id_fkey" FOREIGN KEY (key_id) REFERENCES public.keys(id) ON DELETE CASCADE;

ALTER TABLE "public"."oauth_refresh_tokens"
  ADD CONSTRAINT "oauth_refresh_tokens_revoked_reason_check" CHECK (((revoked_reason IS NULL) OR ((revoked_reason = 'superseded'::text) AND (revoked_at IS NOT NULL))));

CREATE INDEX oauth_refresh_tokens_key_idx ON public.oauth_refresh_tokens USING btree (key_id)
  WHERE (key_id IS NOT NULL);

CREATE TRIGGER revoke_oauth_refresh_tokens_for_inactive_key
  AFTER UPDATE OF status ON public.keys
  FOR EACH ROW
  WHEN (((old.status = 'active'::text) AND (new.status IS DISTINCT FROM 'active'::text) AND (new.key_kind = 'oauth_delegated'::text)))
  EXECUTE FUNCTION public.revoke_oauth_refresh_tokens_for_inactive_key();

CREATE TRIGGER revoke_oauth_delegated_refresh_on_scope_loss
  AFTER UPDATE OF scopes ON public.oauth_authorizations
  FOR EACH ROW
  WHEN ((old.scopes IS DISTINCT FROM new.scopes))
  EXECUTE FUNCTION public.revoke_oauth_delegated_refresh_on_scope_loss();

CREATE TRIGGER revoke_oauth_grant_on_authorization_delete
  AFTER DELETE ON public.oauth_authorizations
  FOR EACH ROW
  EXECUTE FUNCTION public.revoke_oauth_grant_on_authorization_revoke();

CREATE TRIGGER revoke_oauth_grant_on_authorization_revoke
  AFTER UPDATE OF revoked_at ON public.oauth_authorizations
  FOR EACH ROW
  WHEN (((old.revoked_at IS NULL) AND (new.revoked_at IS NOT NULL)))
  EXECUTE FUNCTION public.revoke_oauth_grant_on_authorization_revoke();

COMMENT ON COLUMN "public"."oauth_refresh_tokens"."key_id" IS 'The delegated gateway key a third-party app''s refresh token renews. Refreshing rotates that key''s secret; revoking, disabling or deleting the key ends its refresh tokens. NULL for tokens that renew a session JWT (the Phaseo CLI).';

COMMENT ON COLUMN "public"."oauth_refresh_tokens"."revoked_reason" IS 'superseded: approving the same app again renewed this token''s key with a new refresh-token family and retired this one. Presenting a superseded token is just refused, never treated as reuse, so it can''t end the renewed key or the family that replaced it. NULL for every other token, revoked or not.';

COMMENT ON FUNCTION "public"."consume_oauth_code_and_issue_delegated_grant"(uuid, text, text, text, text, uuid, uuid, text, text[], text, text, timestamp
  with time zone) IS 'Exchanges a third-party OAuth authorization code for a delegated gateway key (the access token, 7 days) and a refresh token bound to that key (90 days, rotated by rotate_oauth_delegated_refresh_token), in one transaction. Approving the same app again renews its existing key (same row, new secret, new refresh-token family) instead of adding one, retires the earlier families (revoked_reason superseded), and never turns a paused key back on. Returns {status: issued|renewed|key_inactive|invalid, kid}.';

COMMENT ON FUNCTION "public"."revoke_oauth_delegated_refresh_on_scope_loss"() IS 'When an app''s authorization loses a scope its delegated keys need (gateway:access for a credit-spending key, or every scope a token holds), ends those keys'' refresh tokens, so granting the scope again later never revives them.';

COMMENT ON FUNCTION "public"."revoke_oauth_grant_on_authorization_revoke"() IS 'When someone revokes or deletes an app''s authorization, revokes that app''s delegated keys and refresh tokens in the workspace, so authorizing the app again later never revives them.';

COMMENT ON FUNCTION "public"."revoke_oauth_refresh_token_grant"(text[]) IS 'RFC 7009 revocation of an OAuth refresh token, in one transaction: revokes the token''s whole family and, for a third-party app''s token, its delegated gateway key and every refresh token bound to it. Matches a token even if it was already rotated; a token from a family that re-approving the app superseded revokes nothing more. Locks the authorization before any key or token, like the rotations. Returns revoked or not_found.';

COMMENT ON FUNCTION "public"."revoke_oauth_refresh_tokens_for_inactive_key"() IS 'Ends the refresh tokens of a delegated OAuth key once it is revoked, disabled, paused or deleted, so the app cannot renew it. Turning the key back on does not revive them.';

COMMENT ON FUNCTION "public"."rotate_oauth_delegated_refresh_token"(text, text, timestamp with time zone, text) IS 'Refreshes a third-party app''s delegated gateway key: rotates the refresh token and replaces the same key''s secret, extending it 7 days. Scopes only narrow, and losing a required scope ends the chain. A reused refresh token revokes its chain and the key; a token from a family that re-approving the app superseded is just invalid. Returns {status: rotated|reused|invalid, ...}.';

REVOKE ALL
  ON FUNCTION "public"."consume_oauth_code_and_issue_delegated_grant"(uuid, text, text, text, text, uuid, uuid, text, text[], text, text, timestamp WITH time zone)
  FROM "postgres";

GRANT EXECUTE
  ON FUNCTION "public"."consume_oauth_code_and_issue_delegated_grant"(uuid, text, text, text, text, uuid, uuid, text, text[], text, text, timestamp WITH time zone)
  TO "postgres";

GRANT EXECUTE
  ON FUNCTION "public"."consume_oauth_code_and_issue_delegated_grant"(uuid, text, text, text, text, uuid, uuid, text, text[], text, text, timestamp WITH time zone)
  TO "service_role";

REVOKE ALL ON FUNCTION "public"."revoke_oauth_delegated_refresh_on_scope_loss"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."revoke_oauth_delegated_refresh_on_scope_loss"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."revoke_oauth_grant_on_authorization_revoke"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."revoke_oauth_grant_on_authorization_revoke"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."revoke_oauth_refresh_token_grant"(text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."revoke_oauth_refresh_token_grant"(text[]) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."revoke_oauth_refresh_token_grant"(text[]) TO "service_role";

REVOKE ALL ON FUNCTION "public"."revoke_oauth_refresh_tokens_for_inactive_key"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."revoke_oauth_refresh_tokens_for_inactive_key"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."rotate_oauth_delegated_refresh_token"(text, text, timestamp WITH time zone, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."rotate_oauth_delegated_refresh_token"(text, text, timestamp WITH time zone, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."rotate_oauth_delegated_refresh_token"(text, text, timestamp WITH time zone, text) TO "service_role";
