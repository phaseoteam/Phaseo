CREATE TABLE "public"."workload_identity_policies" (
  "id"                         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"               uuid                     NOT NULL,
  "key_id"                     uuid                     NOT NULL,
  "name"                       text                     NOT NULL,
  "provider"                   text                     NOT NULL,
  "issuer"                     text                     NOT NULL,
  "pinned_owner_id"            text                     NOT NULL,
  "audiences"                  text[]                   NOT NULL,
  "claim_conditions"           jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "max_token_lifetime_seconds" integer                  NOT NULL DEFAULT 43200,
  "status"                     text                     NOT NULL DEFAULT 'active'::text,
  "created_by"                 uuid,
  "created_at"                 timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"                 timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workload_identity_policies_audiences_check" CHECK (((cardinality(audiences) >= 1) AND (cardinality(audiences) <= 10))),
  CONSTRAINT "workload_identity_policies_claim_conditions_check" CHECK ((jsonb_typeof(claim_conditions) = 'object'::text)),
  CONSTRAINT "workload_identity_policies_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "workload_identity_policies_key_id_fkey" FOREIGN KEY (key_id) REFERENCES public.keys(id) ON DELETE CASCADE,
  CONSTRAINT "workload_identity_policies_key_id_key" UNIQUE (key_id),
  CONSTRAINT "workload_identity_policies_lifetime_check" CHECK (((max_token_lifetime_seconds >= 60) AND (max_token_lifetime_seconds <= 43200))),
  CONSTRAINT "workload_identity_policies_name_check" CHECK (((char_length(btrim(name)) >= 1) AND (char_length(name) <= 100))),
  CONSTRAINT "workload_identity_policies_pinned_owner_id_check" CHECK (((char_length(btrim(pinned_owner_id)) >= 1) AND (char_length(pinned_owner_id) <= 256))),
  CONSTRAINT "workload_identity_policies_pkey" PRIMARY KEY (id),
  CONSTRAINT "workload_identity_policies_provider_check" CHECK ((provider = ANY (ARRAY['vercel'::text, 'github_actions'::text]))),
  CONSTRAINT "workload_identity_policies_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'disabled'::text]))),
  CONSTRAINT "workload_identity_policies_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workload_identity_policies"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workload_identity_policies_created_by_idx ON public.workload_identity_policies USING btree (created_by);

CREATE INDEX workload_identity_policies_issuer_owner_idx ON public.workload_identity_policies USING btree (issuer, pinned_owner_id)
  WHERE (status = 'active'::text);

CREATE INDEX workload_identity_policies_workspace_id_idx ON public.workload_identity_policies USING btree (workspace_id);

CREATE POLICY "deny_direct_client_access" ON "public"."workload_identity_policies"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."workload_identity_policies" IS 'Trust policies that let a workload authenticate to the gateway with a short-lived OIDC token from Vercel or GitHub Actions instead of an API key. Each policy owns one keys row (key_kind workload_identity, no usable secret) so limits, budgets, logs and billing use the normal key paths. pinned_owner_id is the immutable owner ID the token must carry (Vercel owner_id, GitHub repository_owner_id); claim_conditions adds exact-match conditions on other claims.';

REVOKE ALL ON TABLE "public"."workload_identity_policies" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."workload_identity_policies" TO "service_role";

REVOKE ALL ON TABLE "public"."workload_identity_policies" FROM "anon", "authenticated";
