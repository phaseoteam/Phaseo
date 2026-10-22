CREATE TABLE "public"."mcp_oauth_clients" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "issuer"            text                     NOT NULL,
  "registration_kind" text                     NOT NULL,
  "redirect_uri"      text                     NOT NULL,
  "client_id"         text                     NOT NULL,
  "client_secret_enc" text,
  "metadata"          jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "mcp_oauth_clients_pkey" PRIMARY KEY (id),
  CONSTRAINT "mcp_oauth_clients_registration_kind_check" CHECK ((registration_kind = ANY (ARRAY['cimd'::text, 'dcr'::text])))
);

ALTER TABLE "public"."mcp_oauth_clients"
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX mcp_oauth_clients_issuer_kind_redirect_idx ON public.mcp_oauth_clients USING btree (issuer, registration_kind, redirect_uri);

CREATE POLICY "deny_direct_client_access" ON "public"."mcp_oauth_clients"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."mcp_oauth_clients" IS 'OAuth client registrations Phaseo holds with upstream MCP authorization servers, shared by every connection to that issuer. Client secrets are encrypted.';

REVOKE ALL ON TABLE "public"."mcp_oauth_clients" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."mcp_oauth_clients" TO "service_role";

REVOKE ALL ON TABLE "public"."mcp_oauth_clients" FROM "anon", "authenticated";
