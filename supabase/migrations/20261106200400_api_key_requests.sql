-- Browser-approved API keys for CLI coding-agent setup.
-- * public.api_key_requests: a key the CLI (or another signed-in app) asked for, waiting for the person to
--   approve it in the dashboard. RLS on, no grants to anon, authenticated or service_role: the API and
--   web-api reach it only through the functions below.
-- * create_api_key_request (POST /v1/key-requests; owner or admin, 5 waiting per person and workspace,
--   10 minutes), get_api_key_request (approval page), begin/finish/abort_api_key_request_approval
--   (dashboard approval: claim, create the key with the stored limits, hold its encrypted secret),
--   deny_api_key_request, and collect_api_key_request (POST /v1/key-requests/{id}/token: the requester
--   with the PKCE verifier, through the same credential and token workspace, gets the secret once;
--   polling is rate-limited), and wipe_expired_api_key_request_secrets (called by the gateway's 5-minute
--   scheduled cleanup, so an uncollected secret is gone within 15 minutes of approval).
-- * Names wrapped in double underscores are reserved for keys Phaseo manages and can't be requested.
-- Hand-written: the declarative sync needs a local Postgres runtime (Docker), which is not
-- available where this was authored. It matches the definitions in schemas/.
SET local check_function_bodies = off;

CREATE TABLE "public"."api_key_requests" (
  "id"                       uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"             uuid                     NOT NULL,
  "requested_by"             uuid                     NOT NULL,
  "requested_via"            text                     NOT NULL,
  "oauth_client_id"          text,
  "requester_credential"     text                     NOT NULL,
  "requester_workspace_id"   uuid                     NOT NULL,
  "client_name"              text                     NOT NULL,
  "agent"                    text,
  "key_name"                 text                     NOT NULL,
  "daily_cost_nanos"         bigint                   NOT NULL DEFAULT 0,
  "monthly_cost_nanos"       bigint                   NOT NULL DEFAULT 0,
  "key_lifetime_days"        integer                  NOT NULL,
  "code_challenge"           text                     NOT NULL,
  "status"                   text                     NOT NULL DEFAULT 'pending'::text,
  "key_id"                   uuid,
  "secret_ciphertext"        text,
  "secret_expires_at"        timestamp with time zone,
  "decided_by"               uuid,
  "decided_at"               timestamp with time zone,
  "collected_at"             timestamp with time zone,
  "last_polled_at"           timestamp with time zone,
  "failed_verifier_attempts" integer                  NOT NULL DEFAULT 0,
  "expires_at"               timestamp with time zone NOT NULL,
  "created_at"               timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"               timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "api_key_requests_pkey" PRIMARY KEY (id),
  CONSTRAINT "api_key_requests_agent_check" CHECK (((agent IS NULL) OR ((length(agent) >= 1) AND (length(agent) <= 64)))),
  CONSTRAINT "api_key_requests_client_name_check" CHECK (((length(client_name) >= 1) AND (length(client_name) <= 120))),
  CONSTRAINT "api_key_requests_code_challenge_check" CHECK ((code_challenge ~ '^[A-Za-z0-9_-]{43}$'::text)),
  CONSTRAINT "api_key_requests_key_lifetime_days_check" CHECK (((key_lifetime_days >= 1) AND (key_lifetime_days <= 365))),
  CONSTRAINT "api_key_requests_key_name_check" CHECK (((length(btrim(key_name)) >= 1) AND (length(key_name) <= 120) AND (btrim(key_name) !~ '^__.*__$'::text))),
  CONSTRAINT "api_key_requests_limits_check" CHECK (((daily_cost_nanos >= 0) AND (monthly_cost_nanos >= 0) AND ((daily_cost_nanos > 0) OR (monthly_cost_nanos > 0)))),
  CONSTRAINT "api_key_requests_requester_credential_check" CHECK (((length(requester_credential) >= 1) AND (length(requester_credential) <= 200))),
  CONSTRAINT "api_key_requests_requested_via_check" CHECK ((requested_via = ANY (ARRAY['oauth'::text, 'management_key'::text]))),
  CONSTRAINT "api_key_requests_secret_check" CHECK (((secret_ciphertext IS NULL) OR ((status = 'approved'::text) AND (secret_expires_at IS NOT NULL)))),
  CONSTRAINT "api_key_requests_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approving'::text, 'approved'::text, 'collected'::text, 'denied'::text, 'expired'::text]))),
  CONSTRAINT "api_key_requests_key_id_fkey" FOREIGN KEY (key_id) REFERENCES public.keys(id) ON DELETE SET NULL,
  CONSTRAINT "api_key_requests_requested_by_fkey" FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "api_key_requests_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."api_key_requests"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX api_key_requests_key_id_idx ON public.api_key_requests USING btree (key_id)
  WHERE (key_id IS NOT NULL);

CREATE INDEX api_key_requests_open_idx ON public.api_key_requests USING btree (requested_by, workspace_id, expires_at)
  WHERE (status = ANY (ARRAY['pending'::text, 'approving'::text]));

CREATE INDEX api_key_requests_secret_expiry_idx ON public.api_key_requests USING btree (secret_expires_at)
  WHERE (secret_ciphertext IS NOT NULL);

CREATE INDEX api_key_requests_workspace_id_idx ON public.api_key_requests USING btree (workspace_id);

CREATE POLICY "deny_direct_client_access" ON "public"."api_key_requests"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."api_key_requests" IS 'API keys asked for by the CLI or another signed-in app, waiting for the person to approve them in the dashboard. The approved key''s secret is held encrypted until the requester collects it with the PKCE verifier, then wiped. Service role only, through the api_key_request functions.';

COMMENT ON COLUMN "public"."api_key_requests"."code_challenge" IS 'base64url SHA-256 of the requester''s code_verifier (PKCE S256). Only the verifier''s holder can collect the key.';

COMMENT ON COLUMN "public"."api_key_requests"."key_name" IS 'Names wrapped in double underscores are reserved for keys Phaseo manages (chat, Slack agent), which are hidden from Settings and the key limit.';

COMMENT ON COLUMN "public"."api_key_requests"."requester_credential" IS 'The credential that asked: oauth:<client id> or api_key:<management key id>. Pickup must come from the same one; a refreshed token of the same client still matches.';

COMMENT ON COLUMN "public"."api_key_requests"."requester_workspace_id" IS 'The workspace of the token that asked, which can differ from workspace_id when the CLI names another workspace. Pickup must come from a token for the same workspace.';

COMMENT ON COLUMN "public"."api_key_requests"."secret_ciphertext" IS 'The approved key''s plaintext, AES-GCM encrypted with a key derived from the key pepper and the request id. Set on approval, wiped when collected or after secret_expires_at (wipe_expired_api_key_request_secrets runs every 5 minutes).';

REVOKE ALL ON TABLE "public"."api_key_requests" FROM "anon", "authenticated", "service_role";

CREATE OR REPLACE FUNCTION public.create_api_key_request (
  p_workspace_id       uuid,
  p_user_id            uuid,
  p_requested_via      text,
  p_oauth_client_id    text,
  p_client_name        text,
  p_agent              text,
  p_key_name           text,
  p_daily_cost_nanos   bigint,
  p_monthly_cost_nanos bigint,
  p_key_lifetime_days  integer,
  p_code_challenge     text,
  p_requester_credential   text,
  p_requester_workspace_id uuid,
  p_ttl_seconds        integer DEFAULT 600,
  p_max_open           integer DEFAULT 5
)
  RETURNS TABLE (
    id         uuid,
    expires_at timestamp with time zone
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Records a pending request for an API key that the person approves in the dashboard. Nothing is
-- created here: the key exists only once the requester approves it there. The requester must be an
-- owner or admin of the workspace (the role that creates keys in the dashboard), and may have at most
-- p_max_open requests waiting in it. Pickup must later come from the same credential (p_requester_credential)
-- and token workspace (p_requester_workspace_id). Secrets of approved requests nobody collected in time are wiped.
declare
  v_id uuid;
  v_expires_at timestamptz := now() + make_interval(secs => least(greatest(coalesce(p_ttl_seconds, 600), 60), 900));
begin
  if p_workspace_id is null or p_user_id is null or p_code_challenge is null
    or nullif(btrim(p_requester_credential), '') is null or p_requester_workspace_id is null then
    raise exception 'api_key_request_invalid_arguments' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = p_user_id
      and m.role::text in ('owner', 'admin')
  ) and not exists (
    select 1 from public.workspaces w
    where w.id = p_workspace_id
      and w.owner_user_id = p_user_id
  ) then
    raise exception 'api_key_request_forbidden' using errcode = '42501';
  end if;

  perform public.wipe_expired_api_key_request_secrets();

  update public.api_key_requests r
  set status = 'expired', updated_at = now()
  where r.requested_by = p_user_id
    and r.status in ('pending', 'approving')
    and r.expires_at <= now();

  perform 1 from public.workspaces w where w.id = p_workspace_id for update;
  if (
    select count(*) from public.api_key_requests r
    where r.requested_by = p_user_id
      and r.workspace_id = p_workspace_id
      and r.status in ('pending', 'approving')
      and r.expires_at > now()
  ) >= greatest(coalesce(p_max_open, 5), 1) then
    raise exception 'api_key_request_limit' using errcode = '54000';
  end if;

  insert into public.api_key_requests (
    workspace_id, requested_by, requested_via, oauth_client_id, client_name, agent, key_name,
    daily_cost_nanos, monthly_cost_nanos, key_lifetime_days, code_challenge, requester_credential,
    requester_workspace_id, expires_at
  ) values (
    p_workspace_id, p_user_id, p_requested_via, nullif(btrim(p_oauth_client_id), ''), btrim(p_client_name),
    nullif(btrim(p_agent), ''), btrim(p_key_name), coalesce(p_daily_cost_nanos, 0), coalesce(p_monthly_cost_nanos, 0),
    p_key_lifetime_days, p_code_challenge, btrim(p_requester_credential), p_requester_workspace_id, v_expires_at
  )
  returning api_key_requests.id into v_id;

  return query select v_id, v_expires_at;
end;
$function$;

COMMENT ON FUNCTION "public"."create_api_key_request"(uuid, uuid, text, text, text, text, text, bigint, bigint, integer, text, text, uuid, integer, integer) IS 'Records a pending API key request for a workspace owner or admin to approve in the dashboard (at most p_max_open waiting per person and workspace). Creates no key. Service role only.';

REVOKE ALL ON FUNCTION "public"."create_api_key_request"(uuid, uuid, text, text, text, text, text, bigint, bigint, integer, text, text, uuid, integer, integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."create_api_key_request"(uuid, uuid, text, text, text, text, text, bigint, bigint, integer, text, text, uuid, integer, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."create_api_key_request"(uuid, uuid, text, text, text, text, text, bigint, bigint, integer, text, text, uuid, integer, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."create_api_key_request"(uuid, uuid, text, text, text, text, text, bigint, bigint, integer, text, text, uuid, integer, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."create_api_key_request"(uuid, uuid, text, text, text, text, text, bigint, bigint, integer, text, text, uuid, integer, integer) FROM "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.get_api_key_request (
  p_request_id uuid
)
  RETURNS TABLE (
    id                 uuid,
    workspace_id       uuid,
    requested_by       uuid,
    requested_via      text,
    oauth_client_id    text,
    client_name        text,
    agent              text,
    key_name           text,
    daily_cost_nanos   bigint,
    monthly_cost_nanos bigint,
    key_lifetime_days  integer,
    status             text,
    key_id             uuid,
    decided_at         timestamp with time zone,
    expires_at         timestamp with time zone,
    created_at         timestamp with time zone
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- What the approval page shows. Never the code challenge or the encrypted secret. A request still
  -- waiting after its expiry reads as expired.
  select r.id, r.workspace_id, r.requested_by, r.requested_via, r.oauth_client_id, r.client_name, r.agent, r.key_name,
    r.daily_cost_nanos, r.monthly_cost_nanos, r.key_lifetime_days,
    case when r.status in ('pending', 'approving') and r.expires_at <= now() then 'expired' else r.status end,
    r.key_id, r.decided_at, r.expires_at, r.created_at
  from public.api_key_requests r
  where r.id = p_request_id;
$function$;

COMMENT ON FUNCTION "public"."get_api_key_request"(uuid) IS 'Reads an API key request for the dashboard approval page, without its code challenge or secret. Callers check that the signed-in person made the request. Service role only.';

REVOKE ALL ON FUNCTION "public"."get_api_key_request"(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."get_api_key_request"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_api_key_request"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_api_key_request"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_api_key_request"(uuid) FROM "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.begin_api_key_request_approval (
  p_request_id uuid,
  p_user_id    uuid
)
  RETURNS TABLE (
    status             text,
    changed            boolean,
    workspace_id       uuid,
    key_name           text,
    daily_cost_nanos   bigint,
    monthly_cost_nanos bigint,
    key_lifetime_days  integer
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Claims a pending API key request for approval, so two approvals can't both create a key. Only the
-- person who made the request may approve it, and only while they are an owner or admin of its
-- workspace. Returns exactly the stored name, limits and lifetime the key must be created with.
-- The caller creates the key, then calls finish_api_key_request_approval, or
-- abort_api_key_request_approval if it couldn't.
declare
  v_request public.api_key_requests%rowtype;
begin
  if p_request_id is null or p_user_id is null then
    raise exception 'api_key_request_invalid_arguments' using errcode = '22023';
  end if;

  select * into v_request
  from public.api_key_requests r
  where r.id = p_request_id
  for update;
  if not found or v_request.requested_by <> p_user_id then
    raise exception 'api_key_request_not_found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = v_request.workspace_id
      and m.user_id = p_user_id
      and m.role::text in ('owner', 'admin')
  ) and not exists (
    select 1 from public.workspaces w
    where w.id = v_request.workspace_id
      and w.owner_user_id = p_user_id
  ) then
    raise exception 'api_key_request_forbidden' using errcode = '42501';
  end if;

  if v_request.status in ('pending', 'approving') and v_request.expires_at <= now() then
    update public.api_key_requests r
    set status = 'expired', updated_at = now()
    where r.id = v_request.id;
    return query select 'expired'::text, false, v_request.workspace_id, v_request.key_name,
      v_request.daily_cost_nanos, v_request.monthly_cost_nanos, v_request.key_lifetime_days;
    return;
  end if;

  if v_request.status <> 'pending' then
    return query select v_request.status, false, v_request.workspace_id, v_request.key_name,
      v_request.daily_cost_nanos, v_request.monthly_cost_nanos, v_request.key_lifetime_days;
    return;
  end if;

  update public.api_key_requests r
  set status = 'approving', decided_by = p_user_id, decided_at = now(), updated_at = now()
  where r.id = v_request.id;

  return query select 'approving'::text, true, v_request.workspace_id, v_request.key_name,
    v_request.daily_cost_nanos, v_request.monthly_cost_nanos, v_request.key_lifetime_days;
end;
$function$;

COMMENT ON FUNCTION "public"."begin_api_key_request_approval"(uuid, uuid) IS 'Claims a pending API key request for approval by the person who made it, while they are a workspace owner or admin, and returns the stored key name, limits and lifetime. Service role only.';

REVOKE ALL ON FUNCTION "public"."begin_api_key_request_approval"(uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."begin_api_key_request_approval"(uuid, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."begin_api_key_request_approval"(uuid, uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."begin_api_key_request_approval"(uuid, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."begin_api_key_request_approval"(uuid, uuid) FROM "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.finish_api_key_request_approval (
  p_request_id         uuid,
  p_user_id            uuid,
  p_key_id             uuid,
  p_secret_ciphertext  text,
  p_secret_ttl_seconds integer DEFAULT 600
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Marks a claimed API key request approved with the key created for it, and holds the key's encrypted
-- secret for the requester to collect (at most 15 minutes). False when the request isn't claimed by
-- this person any more.
begin
  if p_request_id is null or p_user_id is null or p_key_id is null or nullif(p_secret_ciphertext, '') is null then
    raise exception 'api_key_request_invalid_arguments' using errcode = '22023';
  end if;

  update public.api_key_requests r
  set status = 'approved',
      key_id = p_key_id,
      secret_ciphertext = p_secret_ciphertext,
      secret_expires_at = now() + make_interval(secs => least(greatest(coalesce(p_secret_ttl_seconds, 600), 60), 900)),
      updated_at = now()
  where r.id = p_request_id
    and r.requested_by = p_user_id
    and r.decided_by = p_user_id
    and r.status = 'approving';
  return found;
end;
$function$;

COMMENT ON FUNCTION "public"."finish_api_key_request_approval"(uuid, uuid, uuid, text, integer) IS 'Marks a claimed API key request approved and holds the new key''s encrypted secret until the requester collects it or it expires. Service role only.';

REVOKE ALL ON FUNCTION "public"."finish_api_key_request_approval"(uuid, uuid, uuid, text, integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."finish_api_key_request_approval"(uuid, uuid, uuid, text, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."finish_api_key_request_approval"(uuid, uuid, uuid, text, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."finish_api_key_request_approval"(uuid, uuid, uuid, text, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."finish_api_key_request_approval"(uuid, uuid, uuid, text, integer) FROM "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.abort_api_key_request_approval (
  p_request_id uuid,
  p_user_id    uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Puts a claimed API key request back to pending when its key couldn't be created, so the person can
-- try again before it expires.
begin
  update public.api_key_requests r
  set status = 'pending', decided_by = null, decided_at = null, updated_at = now()
  where r.id = p_request_id
    and r.requested_by = p_user_id
    and r.decided_by = p_user_id
    and r.status = 'approving';
  return found;
end;
$function$;

COMMENT ON FUNCTION "public"."abort_api_key_request_approval"(uuid, uuid) IS 'Returns a claimed API key request to pending after its key could not be created. Service role only.';

REVOKE ALL ON FUNCTION "public"."abort_api_key_request_approval"(uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."abort_api_key_request_approval"(uuid, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."abort_api_key_request_approval"(uuid, uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."abort_api_key_request_approval"(uuid, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."abort_api_key_request_approval"(uuid, uuid) FROM "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.deny_api_key_request (
  p_request_id uuid,
  p_user_id    uuid
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- The person who made an API key request turns it down. Nothing is created. Returns the request's
-- status afterwards: denied, or the status it already had if it wasn't pending.
declare
  v_request public.api_key_requests%rowtype;
begin
  select * into v_request
  from public.api_key_requests r
  where r.id = p_request_id
  for update;
  if not found or v_request.requested_by <> p_user_id then
    raise exception 'api_key_request_not_found' using errcode = 'P0002';
  end if;

  if v_request.status in ('pending', 'approving') and v_request.expires_at <= now() then
    update public.api_key_requests r set status = 'expired', updated_at = now() where r.id = v_request.id;
    return 'expired';
  end if;

  if v_request.status <> 'pending' then
    return v_request.status;
  end if;

  update public.api_key_requests r
  set status = 'denied', decided_by = p_user_id, decided_at = now(), updated_at = now()
  where r.id = v_request.id;
  return 'denied';
end;
$function$;

COMMENT ON FUNCTION "public"."deny_api_key_request"(uuid, uuid) IS 'Denies a pending API key request for the person who made it. Creates nothing. Service role only.';

REVOKE ALL ON FUNCTION "public"."deny_api_key_request"(uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."deny_api_key_request"(uuid, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."deny_api_key_request"(uuid, uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."deny_api_key_request"(uuid, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."deny_api_key_request"(uuid, uuid) FROM "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.collect_api_key_request (
  p_request_id          uuid,
  p_user_id             uuid,
  p_requester_credential   text,
  p_requester_workspace_id uuid,
  p_code_challenge      text,
  p_min_poll_seconds    integer DEFAULT 2,
  p_max_failed_attempts integer DEFAULT 5
)
  RETURNS TABLE (
    outcome           text,
    workspace_id      uuid,
    key_id            uuid,
    secret_ciphertext text
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- The requester polls for its API key. Only the person who made the request, through the same credential
-- (OAuth client or management key) and a token for the same workspace, holding the verifier of its code
-- challenge, gets the key's encrypted secret, once: it is wiped as it is returned. Any other caller gets
-- not_found before anything is counted, so it can't use up the verifier attempts.
-- Outcomes: not_found (no such request for this caller), slow_down (polled again within
-- p_min_poll_seconds), invalid_verifier (after p_max_failed_attempts the request is denied and any
-- secret wiped), pending, approved (with the secret), collected (already picked up), denied, expired.
declare
  v_request public.api_key_requests%rowtype;
  v_failed integer;
begin
  select * into v_request
  from public.api_key_requests r
  where r.id = p_request_id
  for update;
  if not found
    or v_request.requested_by is distinct from p_user_id
    or v_request.requester_credential is distinct from p_requester_credential
    or v_request.requester_workspace_id is distinct from p_requester_workspace_id then
    return query select 'not_found'::text, null::uuid, null::uuid, null::text;
    return;
  end if;

  if v_request.last_polled_at is not null
    and v_request.last_polled_at > now() - make_interval(secs => greatest(coalesce(p_min_poll_seconds, 2), 0)) then
    return query select 'slow_down'::text, null::uuid, null::uuid, null::text;
    return;
  end if;

  if p_code_challenge is null or v_request.code_challenge <> p_code_challenge then
    v_failed := v_request.failed_verifier_attempts + 1;
    update public.api_key_requests r
    set last_polled_at = now(),
        failed_verifier_attempts = v_failed,
        status = case
          when v_failed >= greatest(coalesce(p_max_failed_attempts, 5), 1) and r.status in ('pending', 'approving', 'approved') then 'denied'
          else r.status
        end,
        secret_ciphertext = case when v_failed >= greatest(coalesce(p_max_failed_attempts, 5), 1) then null else r.secret_ciphertext end,
        updated_at = now()
    where r.id = v_request.id;
    return query select 'invalid_verifier'::text, null::uuid, null::uuid, null::text;
    return;
  end if;

  if v_request.status in ('pending', 'approving') then
    if v_request.expires_at <= now() then
      update public.api_key_requests r set status = 'expired', last_polled_at = now(), updated_at = now() where r.id = v_request.id;
      return query select 'expired'::text, null::uuid, null::uuid, null::text;
      return;
    end if;
    update public.api_key_requests r set last_polled_at = now() where r.id = v_request.id;
    return query select 'pending'::text, null::uuid, null::uuid, null::text;
    return;
  end if;

  if v_request.status = 'approved' then
    if v_request.secret_ciphertext is null or v_request.secret_expires_at <= now() then
      update public.api_key_requests r
      set status = 'expired', secret_ciphertext = null, last_polled_at = now(), updated_at = now()
      where r.id = v_request.id;
      return query select 'expired'::text, null::uuid, null::uuid, null::text;
      return;
    end if;
    update public.api_key_requests r
    set status = 'collected', secret_ciphertext = null, collected_at = now(), last_polled_at = now(), updated_at = now()
    where r.id = v_request.id;
    return query select 'approved'::text, v_request.workspace_id, v_request.key_id, v_request.secret_ciphertext;
    return;
  end if;

  update public.api_key_requests r set last_polled_at = now() where r.id = v_request.id;
  return query select v_request.status, null::uuid, null::uuid, null::text;
end;
$function$;

COMMENT ON FUNCTION "public"."collect_api_key_request"(uuid, uuid, text, uuid, text, integer, integer) IS 'Returns an approved API key''s encrypted secret once, to the person who requested it and holds the PKCE verifier, and wipes it; otherwise the request''s status. Rate-limits polling and denies the request after repeated wrong verifiers. Service role only.';

REVOKE ALL ON FUNCTION "public"."collect_api_key_request"(uuid, uuid, text, uuid, text, integer, integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."collect_api_key_request"(uuid, uuid, text, uuid, text, integer, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."collect_api_key_request"(uuid, uuid, text, uuid, text, integer, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."collect_api_key_request"(uuid, uuid, text, uuid, text, integer, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."collect_api_key_request"(uuid, uuid, text, uuid, text, integer, integer) FROM "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.wipe_expired_api_key_request_secrets ()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Wipes the encrypted secret of every approved key request nobody collected before secret_expires_at
-- (at most 15 minutes after approval) and marks the request expired. Only clears columns; rows are kept.
-- The gateway's 5-minute scheduled cleanup calls it, so no ciphertext outlives its expiry by more than a
-- few minutes even when nobody polls or asks again. Returns the number of secrets wiped.
declare
  v_wiped integer;
begin
  update public.api_key_requests r
  set secret_ciphertext = null, status = 'expired', updated_at = now()
  where r.secret_ciphertext is not null
    and r.secret_expires_at <= now();
  get diagnostics v_wiped = row_count;
  return v_wiped;
end;
$function$;

COMMENT ON FUNCTION "public"."wipe_expired_api_key_request_secrets"() IS 'Clears the encrypted secrets of approved API key requests past secret_expires_at and marks them expired. Called by the gateway scheduled cleanup every 5 minutes. Service role only.';

REVOKE ALL ON FUNCTION "public"."wipe_expired_api_key_request_secrets"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."wipe_expired_api_key_request_secrets"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."wipe_expired_api_key_request_secrets"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."wipe_expired_api_key_request_secrets"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."wipe_expired_api_key_request_secrets"() FROM "anon", "authenticated";
