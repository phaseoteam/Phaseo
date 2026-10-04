CREATE TABLE "public"."byok_keys" (
  "id"                  uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"        uuid                     NOT NULL,
  "provider_id"         text                     NOT NULL,
  "name"                text                     NOT NULL,
  "enabled"             boolean                  NOT NULL DEFAULT true,
  "always_use"          boolean                  NOT NULL DEFAULT false,
  "enc_value"           bytea                    NOT NULL,
  "enc_iv"              bytea                    NOT NULL,
  "enc_tag"             bytea                    NOT NULL,
  "key_version"         integer                  NOT NULL DEFAULT 1,
  "fingerprint_sha256"  text                     NOT NULL,
  "prefix"              text                     NOT NULL,
  "suffix"              text                     NOT NULL,
  "created_by"          uuid                     NOT NULL,
  "created_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "last_used_at"        timestamp with time zone,
  "last_verified_at"    timestamp with time zone,
  "verification_status" text                     NOT NULL DEFAULT 'unknown'::text,
  "error_message"       text,
  "routing_mode"        text                     NOT NULL DEFAULT 'fallback'::text,
  "sort_order"          integer                  NOT NULL DEFAULT 0,
  "allowed_model_slugs" text[],
  "allowed_api_key_ids" uuid[],
  "enc_aad_version"     smallint                 NOT NULL DEFAULT 0,
  CONSTRAINT "byok_keys_allowed_api_key_ids_limit" CHECK (((allowed_api_key_ids IS NULL) OR (cardinality(allowed_api_key_ids) <= 256))),
  CONSTRAINT "byok_keys_allowed_model_slugs_limit" CHECK (((allowed_model_slugs IS NULL) OR (cardinality(allowed_model_slugs) <= 256))),
  CONSTRAINT "byok_keys_enc_aad_version_check" CHECK ((enc_aad_version = ANY (ARRAY[0, 1]))),
  CONSTRAINT "byok_keys_pkey" PRIMARY KEY (id),
  CONSTRAINT "byok_keys_routing_mode_check" CHECK ((routing_mode = ANY (ARRAY['priority'::text, 'fallback'::text]))),
  CONSTRAINT "byok_keys_workspace_id_provider_id_fingerprint_sha256_key" UNIQUE (workspace_id, provider_id, fingerprint_sha256),
  CONSTRAINT "byok_keys_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.users(user_id) ON DELETE SET NULL,
  CONSTRAINT "byok_keys_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."byok_keys"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX byok_keys_always_use_idx ON public.byok_keys USING btree (workspace_id, provider_id, always_use)
  WHERE (always_use = true);

CREATE INDEX byok_keys_created_by_idx ON public.byok_keys USING btree (created_by);

CREATE INDEX byok_keys_enabled_idx ON public.byok_keys USING btree (workspace_id, enabled)
  WHERE (enabled = true);

CREATE INDEX byok_keys_gateway_lookup_idx ON public.byok_keys USING btree (workspace_id, provider_id, routing_mode, sort_order, created_at)
  WHERE (enabled = true);

CREATE TRIGGER enforce_byok_key_provider_limit
  BEFORE INSERT OR UPDATE OF workspace_id, provider_id, routing_mode ON public.byok_keys
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_byok_key_provider_limit();

CREATE TRIGGER gateway_workspace_publication
  AFTER INSERT OR DELETE OR UPDATE ON public.byok_keys
  FOR EACH ROW
  EXECUTE FUNCTION private.capture_gateway_workspace_publication();

CREATE POLICY "byok_keys_delete_workspace_admin" ON "public"."byok_keys"
  FOR DELETE
  TO "authenticated"
  USING (public.is_workspace_admin(workspace_id));

CREATE POLICY "byok_keys_insert_workspace_admin" ON "public"."byok_keys"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (public.is_workspace_admin(workspace_id));

CREATE POLICY "byok_keys_select_workspace_member" ON "public"."byok_keys"
  FOR SELECT
  TO "authenticated"
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "byok_keys_update_workspace_admin" ON "public"."byok_keys"
  FOR UPDATE
  TO "authenticated"
  USING (public.is_workspace_admin(workspace_id))
  WITH CHECK (public.is_workspace_admin(workspace_id));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."byok_keys" TO "anon", "authenticated", "service_role";

COMMENT ON COLUMN "public"."byok_keys"."allowed_api_key_ids" IS 'Null or empty allows every workspace API key; otherwise only requests authenticated by a listed API key may use this credential.';

COMMENT ON COLUMN "public"."byok_keys"."allowed_model_slugs" IS 'Null or empty allows every model routed through this provider; otherwise only listed canonical model slugs may use this credential.';

COMMENT ON COLUMN "public"."byok_keys"."enc_aad_version" IS 'AES-GCM associated-data format. Version 1 binds ciphertext to workspace, provider, and key version; 0 identifies legacy rows.';
