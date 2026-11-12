CREATE TABLE "public"."workspace_private_models" (
  "id"                   uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"         uuid                     NOT NULL,
  "model_id"             text                     NOT NULL,
  "name"                 text                     NOT NULL,
  "description"          text,
  "base_url"             text                     NOT NULL,
  "upstream_model_id"    text                     NOT NULL,
  "supports_responses"   boolean                  NOT NULL DEFAULT false,
  "enabled"              boolean                  NOT NULL DEFAULT true,
  "input_modalities"     text[]                   NOT NULL DEFAULT ARRAY['text'::text],
  "output_modalities"    text[]                   NOT NULL DEFAULT ARRAY['text'::text],
  "context_length"       integer,
  "max_output_tokens"    integer,
  "provider_id"          text                     NOT NULL,
  "enc_value"            bytea                    NOT NULL,
  "enc_iv"               bytea                    NOT NULL,
  "enc_tag"              bytea                    NOT NULL,
  "key_version"          integer                  NOT NULL,
  "enc_aad_version"      integer                  NOT NULL DEFAULT 1,
  "fingerprint_sha256"   text                     NOT NULL,
  "credential_prefix"    text,
  "credential_suffix"    text,
  "created_by"           uuid,
  "created_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "local_slug"           text                     NOT NULL,
  "catalog_model_id"     text,
  "host_provider_id"     text,
  "custom_provider_name" text,
  "custom_provider_url"  text,
  "routing_policy"       text                     NOT NULL DEFAULT 'preferred'::text,
  CONSTRAINT "workspace_private_models_catalog_model_id_format"
    CHECK (((catalog_model_id IS NULL) OR (catalog_model_id ~ '^[a-z0-9][a-z0-9._-]{0,62}/[a-z0-9][a-z0-9._:-]{0,126}$'::text))),
  CONSTRAINT "workspace_private_models_context_length" CHECK (((context_length IS NULL) OR (context_length > 0))),
  CONSTRAINT "workspace_private_models_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "workspace_private_models_custom_provider_name_length"
    CHECK (((custom_provider_name IS NULL) OR ((char_length(custom_provider_name) >= 1) AND (char_length(custom_provider_name) <= 120)))),
  CONSTRAINT "workspace_private_models_custom_provider_url_https" CHECK (((custom_provider_url IS NULL) OR (custom_provider_url ~ '^https://'::text))),
  CONSTRAINT "workspace_private_models_host_identity" CHECK (((host_provider_id IS NOT NULL) <> (custom_provider_name IS NOT NULL))),
  CONSTRAINT "workspace_private_models_https_base_url" CHECK ((base_url ~ '^https://'::text)),
  CONSTRAINT "workspace_private_models_local_slug_format" CHECK ((local_slug ~ '^[a-z0-9][a-z0-9._:-]{0,126}$'::text)),
  CONSTRAINT "workspace_private_models_max_output_tokens" CHECK (((max_output_tokens IS NULL) OR (max_output_tokens > 0))),
  CONSTRAINT "workspace_private_models_model_id_format" CHECK ((model_id ~ '^[a-z0-9][a-z0-9._-]{0,62}/[a-z0-9][a-z0-9._:-]{0,126}$'::text)),
  CONSTRAINT "workspace_private_models_name_length" CHECK (((char_length(name) >= 1) AND (char_length(name) <= 120))),
  CONSTRAINT "workspace_private_models_pkey" PRIMARY KEY (id),
  CONSTRAINT "workspace_private_models_provider_id" CHECK ((provider_id = ('private-model:'::text || (id)::text))),
  CONSTRAINT "workspace_private_models_routing_policy" CHECK ((routing_policy = ANY (ARRAY['preferred'::text, 'balanced'::text, 'fallback'::text]))),
  CONSTRAINT "workspace_private_models_upstream_model_length" CHECK (((char_length(upstream_model_id) >= 1) AND (char_length(upstream_model_id) <= 255))),
  CONSTRAINT "workspace_private_models_workspace_id_model_id_key" UNIQUE (workspace_id, model_id),
  CONSTRAINT "workspace_private_models_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_private_models"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_private_models_created_by_idx ON public.workspace_private_models USING btree (created_by);

CREATE INDEX workspace_private_models_workspace_enabled_idx ON public.workspace_private_models USING btree (workspace_id, enabled, model_id);

CREATE INDEX workspace_private_models_workspace_id_idx ON public.workspace_private_models USING btree (workspace_id);

CREATE TRIGGER gateway_workspace_publication
  AFTER INSERT OR DELETE OR UPDATE ON public.workspace_private_models
  FOR EACH ROW
  EXECUTE FUNCTION private.capture_gateway_workspace_publication();

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_private_models"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON COLUMN "public"."workspace_private_models"."base_url" IS 'Validated HTTPS OpenAI-compatible base URL. Server-side management APIs are the only supported write path.';

COMMENT ON COLUMN "public"."workspace_private_models"."catalog_model_id" IS 'Exact canonical public catalogue model identity. Null means this is a workspace-defined model.';

COMMENT ON COLUMN "public"."workspace_private_models"."host_provider_id" IS 'Optional existing catalogue provider used for display and workspace telemetry; never used as encryption AAD.';

COMMENT ON COLUMN "public"."workspace_private_models"."local_slug" IS 'User-entered deployment slug. Workspace-defined models derive model_id from the workspace namespace and this value.';

COMMENT ON COLUMN "public"."workspace_private_models"."provider_id" IS 'Stable AES-GCM AAD identity. This value must never be exposed as a public provider.';

COMMENT ON COLUMN "public"."workspace_private_models"."routing_policy" IS 'How this private route participates alongside other routes for an attached catalogue model.';

COMMENT ON TABLE "public"."workspace_private_models" IS 'Workspace-owned private model endpoints. Endpoint locations and credentials are server-only and never part of the public catalogue.';

REVOKE ALL ON TABLE "public"."workspace_private_models" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."workspace_private_models" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_private_models" FROM "anon", "authenticated";
