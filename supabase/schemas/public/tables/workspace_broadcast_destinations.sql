CREATE TABLE "public"."workspace_broadcast_destinations" (
  "id"                                  uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"                        uuid                     NOT NULL,
  "enabled"                             boolean                  NOT NULL DEFAULT false,
  "destination_id"                      text                     NOT NULL,
  "name"                                text                     NOT NULL,
  "destination_config"                  jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "privacy_exclude_prompts_and_outputs" boolean                  NOT NULL DEFAULT false,
  "sampling_rate"                       numeric(6,5)             NOT NULL DEFAULT 1.0,
  "group_join_operator"                 text                     NOT NULL DEFAULT 'or'::text,
  "created_at"                          timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  "updated_at"                          timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  "destination_config_ciphertext"       text,
  "destination_config_iv"               text,
  "destination_config_key_version"      text,
  "include_generation_metadata"         boolean                  NOT NULL DEFAULT true,
  "include_cost_metadata"               boolean                  NOT NULL DEFAULT true,
  "include_identity_metadata"           boolean                  NOT NULL DEFAULT true,
  "include_request_context"             boolean                  NOT NULL DEFAULT true,
  CONSTRAINT "workspace_broadcast_destinations_destination_id_check"
    CHECK
    ((destination_id = ANY (ARRAY['arize'::text, 'braintrust'::text, 'clickhouse'::text, 'comet_opik'::text, 'datadog'::text, 'grafana_cloud'::text, 'langfuse'::text,
    'langsmith'::text, 'new_relic'::text, 'otel_collector'::text, 'posthog'::text, 's3'::text, 'sentry'::text, 'snowflake'::text, 'wandb_weave'::text, 'webhook'::text]))),
  CONSTRAINT "workspace_broadcast_destinations_group_join_operator_check" CHECK ((group_join_operator = ANY (ARRAY['and'::text, 'or'::text]))),
  CONSTRAINT "workspace_broadcast_destinations_pkey" PRIMARY KEY (id),
  CONSTRAINT "workspace_broadcast_destinations_sampling_rate_check" CHECK (((sampling_rate >= (0)::numeric) AND (sampling_rate <= (1)::numeric))),
  CONSTRAINT "workspace_broadcast_destinations_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_broadcast_destinations"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_broadcast_destinations_workspace_enabled_idx ON public.workspace_broadcast_destinations USING btree (workspace_id, enabled);

CREATE POLICY "team_broadcast_destinations_delete_own_team" ON "public"."workspace_broadcast_destinations"
  FOR DELETE
  TO "authenticated"
  USING (public.is_workspace_admin(workspace_id));

CREATE POLICY "team_broadcast_destinations_insert_own_team" ON "public"."workspace_broadcast_destinations"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (public.is_workspace_admin(workspace_id));

CREATE POLICY "team_broadcast_destinations_update_own_team" ON "public"."workspace_broadcast_destinations"
  FOR UPDATE
  TO "authenticated"
  USING (public.is_workspace_admin(workspace_id))
  WITH CHECK (public.is_workspace_admin(workspace_id));

CREATE POLICY "workspace_broadcast_destinations_select_own_workspace" ON "public"."workspace_broadcast_destinations"
  FOR SELECT
  TO "authenticated"
  USING (public.is_workspace_admin(workspace_id));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workspace_broadcast_destinations" TO "authenticated", "service_role";

COMMENT ON COLUMN "public"."workspace_broadcast_destinations"."destination_config" IS 'Legacy non-secret configuration only. New destination credentials are stored in encrypted columns.';

COMMENT ON COLUMN "public"."workspace_broadcast_destinations"."destination_config_ciphertext" IS 'AES-GCM encrypted destination configuration. Never return through browser-facing APIs.';

REVOKE ALL ON TABLE "public"."workspace_broadcast_destinations" FROM "anon";
