CREATE TABLE "public"."slack_apps" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"       uuid                     NOT NULL,
  "slack_app_id"       text                     NOT NULL,
  "client_id"          text                     NOT NULL,
  "secrets_ciphertext" text                     NOT NULL,
  "created_by"         uuid,
  "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"         timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "slack_apps_client_id_check" CHECK ((client_id ~ '^[0-9]+\.[0-9]+$'::text)),
  CONSTRAINT "slack_apps_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "slack_apps_pkey" PRIMARY KEY (id),
  CONSTRAINT "slack_apps_secrets_check" CHECK ((length(secrets_ciphertext) > 0)),
  CONSTRAINT "slack_apps_slack_app_id_check" CHECK ((slack_app_id ~ '^A[A-Z0-9]{2,31}$'::text)),
  CONSTRAINT "slack_apps_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."slack_apps"
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX slack_apps_slack_app_id_idx ON public.slack_apps USING btree (slack_app_id);

CREATE UNIQUE INDEX slack_apps_workspace_idx ON public.slack_apps USING btree (workspace_id);

CREATE TRIGGER slack_apps_set_updated_at
  BEFORE UPDATE ON public.slack_apps
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_if_changed();

CREATE POLICY "deny_direct_client_access" ON "public"."slack_apps"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."slack_apps" IS 'A company''s own Slack app for the Phaseo Slack agent, created from Phaseo''s manifest, used instead of the hosted app. At most one per workspace. Only the settings API and the Slack Worker read it.';

COMMENT ON COLUMN "public"."slack_apps"."secrets_ciphertext" IS 'AES-GCM encrypted JSON {client_secret, signing_secret}, keyed by SLACK_SECRETS_ENCRYPTION_KEY. Never returned to clients.';

REVOKE ALL ON TABLE "public"."slack_apps" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."slack_apps" TO "service_role";

REVOKE ALL ON TABLE "public"."slack_apps" FROM "anon", "authenticated";
