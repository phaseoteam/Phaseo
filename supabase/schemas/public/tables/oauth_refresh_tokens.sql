CREATE TABLE "public"."oauth_refresh_tokens" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "token_hash"   text                     NOT NULL,
  "user_id"      uuid                     NOT NULL,
  "workspace_id" uuid                     NOT NULL,
  "client_id"    text                     NOT NULL,
  "scopes"       text[]                   NOT NULL DEFAULT '{}'::text[],
  "expires_at"   timestamp with time zone,
  "revoked_at"   timestamp with time zone,
  "rotated_from" uuid,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "last_used_at" timestamp with time zone,
  "family_id"    uuid                     NOT NULL,
  CONSTRAINT "oauth_refresh_tokens_pkey" PRIMARY KEY (id),
  CONSTRAINT "oauth_refresh_tokens_rotated_from_fkey" FOREIGN KEY (rotated_from) REFERENCES public.oauth_refresh_tokens(id),
  CONSTRAINT "oauth_refresh_tokens_token_hash_key" UNIQUE (token_hash),
  CONSTRAINT "oauth_refresh_tokens_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "oauth_refresh_tokens_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."oauth_refresh_tokens"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX oauth_refresh_tokens_family_idx ON public.oauth_refresh_tokens USING btree (family_id);

CREATE INDEX oauth_refresh_tokens_rotated_from_idx ON public.oauth_refresh_tokens USING btree (rotated_from)
  WHERE (rotated_from IS NOT NULL);

CREATE INDEX oauth_refresh_tokens_user_client_idx ON public.oauth_refresh_tokens USING btree (user_id, client_id)
  WHERE (revoked_at IS NULL);

CREATE INDEX oauth_refresh_tokens_workspace_idx ON public.oauth_refresh_tokens USING btree (workspace_id)
  WHERE (revoked_at IS NULL);

CREATE POLICY "service_role_full_access" ON "public"."oauth_refresh_tokens"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."oauth_refresh_tokens" TO "service_role";

REVOKE ALL ON TABLE "public"."oauth_refresh_tokens" FROM "anon", "authenticated";
