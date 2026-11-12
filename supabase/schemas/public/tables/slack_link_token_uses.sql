CREATE TABLE "public"."slack_link_token_uses" (
  "nonce"           text                     NOT NULL,
  "installation_id" uuid                     NOT NULL,
  "slack_user_id"   text                     NOT NULL,
  "user_id"         uuid                     NOT NULL,
  "used_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at"      timestamp with time zone NOT NULL,
  CONSTRAINT "slack_link_token_uses_installation_id_fkey" FOREIGN KEY (installation_id) REFERENCES public.slack_installations(id) ON DELETE CASCADE,
  CONSTRAINT "slack_link_token_uses_nonce_check" CHECK (((length(nonce) >= 8) AND (length(nonce) <= 128))),
  CONSTRAINT "slack_link_token_uses_pkey" PRIMARY KEY (nonce),
  CONSTRAINT "slack_link_token_uses_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE "public"."slack_link_token_uses"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_direct_client_access" ON "public"."slack_link_token_uses"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."slack_link_token_uses" IS 'Slack account link tokens that have been confirmed, by nonce, so each link works once. Only the settings API reads and writes it.';

REVOKE ALL ON TABLE "public"."slack_link_token_uses" FROM "service_role";

GRANT INSERT, SELECT ON TABLE "public"."slack_link_token_uses" TO "service_role";

REVOKE ALL ON TABLE "public"."slack_link_token_uses" FROM "anon", "authenticated";
