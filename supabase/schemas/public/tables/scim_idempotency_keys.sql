CREATE TABLE "public"."scim_idempotency_keys" (
  "id"              bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "workspace_id"    uuid                     NOT NULL,
  "idempotency_key" text                     NOT NULL,
  "request_hash"    text                     NOT NULL,
  "response_status" integer,
  "response_body"   jsonb,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at"      timestamp with time zone NOT NULL DEFAULT (now() + '24:00:00'::interval),
  CONSTRAINT "scim_idempotency_keys_key_length_check" CHECK (((char_length(idempotency_key) >= 1) AND (char_length(idempotency_key) <= 200))),
  CONSTRAINT "scim_idempotency_keys_pkey" PRIMARY KEY (id),
  CONSTRAINT "scim_idempotency_keys_workspace_key" UNIQUE (workspace_id, idempotency_key),
  CONSTRAINT "scim_idempotency_keys_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."scim_idempotency_keys"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX scim_idempotency_keys_expires_at_idx ON public.scim_idempotency_keys USING btree (expires_at);

CREATE POLICY "deny_direct_client_access" ON "public"."scim_idempotency_keys"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON SEQUENCE "public"."scim_idempotency_keys_id_seq" FROM "service_role";

GRANT SELECT, USAGE ON SEQUENCE "public"."scim_idempotency_keys_id_seq" TO "service_role";

REVOKE ALL ON TABLE "public"."scim_idempotency_keys" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."scim_idempotency_keys" TO "service_role";

REVOKE ALL ON TABLE "public"."scim_idempotency_keys" FROM "anon", "authenticated";

REVOKE ALL ON SEQUENCE "public"."scim_idempotency_keys_id_seq" FROM "anon";

REVOKE ALL ON SEQUENCE "public"."scim_idempotency_keys_id_seq" FROM "authenticated";
