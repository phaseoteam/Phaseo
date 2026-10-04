CREATE TABLE "public"."oauth_clients" (
  "id"                 text                     NOT NULL,
  "name"               text                     NOT NULL,
  "description"        text,
  "logo_url"           text,
  "homepage_url"       text,
  "client_type"        text                     NOT NULL DEFAULT 'public'::text,
  "client_secret_hash" text,
  "redirect_uris"      text[]                   NOT NULL DEFAULT '{}'::text[],
  "allowed_scopes"     text[]                   NOT NULL DEFAULT '{}'::text[],
  "is_first_party"     boolean                  NOT NULL DEFAULT false,
  "beta_status"        text                     NOT NULL DEFAULT 'private'::text,
  "status"             text                     NOT NULL DEFAULT 'active'::text,
  "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "revoked_at"         timestamp with time zone,
  CONSTRAINT "oauth_clients_beta_status_check" CHECK ((beta_status = ANY (ARRAY['private'::text, 'beta'::text, 'public'::text]))),
  CONSTRAINT "oauth_clients_client_type_check" CHECK ((client_type = ANY (ARRAY['public'::text, 'confidential'::text]))),
  CONSTRAINT "oauth_clients_pkey" PRIMARY KEY (id),
  CONSTRAINT "oauth_clients_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text, 'deleted'::text])))
);

ALTER TABLE "public"."oauth_clients"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON "public"."oauth_clients"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."oauth_clients" TO "service_role";

REVOKE ALL ON TABLE "public"."oauth_clients" FROM "anon", "authenticated";
