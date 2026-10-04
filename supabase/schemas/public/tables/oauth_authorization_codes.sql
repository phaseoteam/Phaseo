CREATE TABLE "public"."oauth_authorization_codes" (
  "id"                    uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "code_hash"             text                     NOT NULL,
  "client_id"             text                     NOT NULL,
  "user_id"               uuid                     NOT NULL,
  "workspace_id"          uuid                     NOT NULL,
  "redirect_uri"          text                     NOT NULL,
  "scopes"                text[]                   NOT NULL DEFAULT '{}'::text[],
  "code_challenge"        text                     NOT NULL,
  "code_challenge_method" text                     NOT NULL DEFAULT 'S256'::text,
  "expires_at"            timestamp with time zone NOT NULL,
  "used_at"               timestamp with time zone,
  "created_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "resource"              text,
  CONSTRAINT "oauth_authorization_codes_code_hash_key" UNIQUE (code_hash),
  CONSTRAINT "oauth_authorization_codes_pkey" PRIMARY KEY (id),
  CONSTRAINT "oauth_authorization_codes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "oauth_authorization_codes_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."oauth_authorization_codes"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX oauth_authorization_codes_client_idx ON public.oauth_authorization_codes USING btree (client_id, expires_at);

CREATE INDEX oauth_authorization_codes_user_idx ON public.oauth_authorization_codes USING btree (user_id);

CREATE INDEX oauth_authorization_codes_workspace_id_idx ON public.oauth_authorization_codes USING btree (workspace_id);

CREATE POLICY "service_role_full_access" ON "public"."oauth_authorization_codes"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."oauth_authorization_codes" TO "service_role";

REVOKE ALL ON TABLE "public"."oauth_authorization_codes" FROM "anon", "authenticated";
