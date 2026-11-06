CREATE TABLE "public"."api_key_requests" (
  "id"                       uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"             uuid                     NOT NULL,
  "requested_by"             uuid                     NOT NULL,
  "requested_via"            text                     NOT NULL,
  "oauth_client_id"          text,
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
  CONSTRAINT "api_key_requests_key_name_check" CHECK (((length(btrim(key_name)) >= 1) AND (length(key_name) <= 120))),
  CONSTRAINT "api_key_requests_limits_check" CHECK (((daily_cost_nanos >= 0) AND (monthly_cost_nanos >= 0) AND ((daily_cost_nanos > 0) OR (monthly_cost_nanos > 0)))),
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

COMMENT ON COLUMN "public"."api_key_requests"."secret_ciphertext" IS 'The approved key''s plaintext, AES-GCM encrypted with a key derived from the key pepper and the request id. Set on approval, wiped when collected or after secret_expires_at.';

REVOKE ALL ON TABLE "public"."api_key_requests" FROM "anon", "authenticated", "service_role";
