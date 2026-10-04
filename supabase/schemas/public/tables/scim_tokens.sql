CREATE TABLE "public"."scim_tokens" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "endpoint_id"  uuid                     NOT NULL,
  "token_prefix" text                     NOT NULL,
  "token_hash"   text                     NOT NULL,
  "label"        text                     NOT NULL,
  "created_by"   uuid,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at"   timestamp with time zone,
  "last_used_at" timestamp with time zone,
  "revoked_at"   timestamp with time zone,
  CONSTRAINT "scim_tokens_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "scim_tokens_endpoint_id_fkey" FOREIGN KEY (endpoint_id) REFERENCES public.scim_endpoints(id) ON DELETE CASCADE,
  CONSTRAINT "scim_tokens_label_length_check" CHECK (((char_length(label) >= 1) AND (char_length(label) <= 100))),
  CONSTRAINT "scim_tokens_pkey" PRIMARY KEY (id),
  CONSTRAINT "scim_tokens_prefix_length_check" CHECK (((char_length(token_prefix) >= 8) AND (char_length(token_prefix) <= 32))),
  CONSTRAINT "scim_tokens_token_prefix_key" UNIQUE (token_prefix)
);

ALTER TABLE "public"."scim_tokens"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX scim_tokens_active_prefix_idx ON public.scim_tokens USING btree (token_prefix)
  WHERE (revoked_at IS NULL);

CREATE INDEX scim_tokens_created_by_idx ON public.scim_tokens USING btree (created_by);

CREATE INDEX scim_tokens_endpoint_id_idx ON public.scim_tokens USING btree (endpoint_id);

CREATE POLICY "deny_direct_client_access" ON "public"."scim_tokens"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE "public"."scim_tokens" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."scim_tokens" TO "service_role";

REVOKE ALL ON TABLE "public"."scim_tokens" FROM "anon", "authenticated";
