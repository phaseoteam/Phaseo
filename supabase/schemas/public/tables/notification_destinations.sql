CREATE TABLE "public"."notification_destinations" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"       uuid                     NOT NULL,
  "name"               text                     NOT NULL,
  "type"               text                     NOT NULL,
  "status"             text                     NOT NULL DEFAULT 'active'::text,
  "target_ciphertext"  text                     NOT NULL,
  "target_iv"          text                     NOT NULL,
  "target_hash"        text                     NOT NULL,
  "target_key_version" text                     NOT NULL DEFAULT 'v1'::text,
  "target_preview"     text                     NOT NULL,
  "is_ephemeral"       boolean                  NOT NULL DEFAULT false,
  "created_by"         uuid,
  "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at"         timestamp with time zone,
  CONSTRAINT "notification_destinations_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "notification_destinations_name_check" CHECK (((char_length(name) >= 1) AND (char_length(name) <= 100))),
  CONSTRAINT "notification_destinations_pkey" PRIMARY KEY (id),
  CONSTRAINT "notification_destinations_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'disabled'::text, 'deleted'::text]))),
  CONSTRAINT "notification_destinations_type_check"
    CHECK ((type = ANY (ARRAY['email'::text, 'discord'::text, 'discord_webhook'::text, 'slack'::text, 'microsoft_teams'::text, 'custom_webhook'::text]))),
  CONSTRAINT "notification_destinations_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."notification_destinations"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX notification_destinations_created_by_idx ON public.notification_destinations USING btree (created_by);

CREATE INDEX notification_destinations_workspace_status_idx ON public.notification_destinations USING btree (workspace_id, status, created_at DESC);

CREATE UNIQUE INDEX notification_destinations_workspace_target_idx ON public.notification_destinations USING btree (workspace_id, TYPE, target_hash)
  WHERE (status <> 'deleted'::text);

CREATE POLICY "deny_direct_client_access" ON "public"."notification_destinations"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."notification_destinations" IS 'Encrypted workspace notification destinations. Decrypted targets are only available to trusted server runtimes.';

REVOKE ALL ON TABLE "public"."notification_destinations" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."notification_destinations" TO "service_role";

REVOKE ALL ON TABLE "public"."notification_destinations" FROM "anon", "authenticated";
