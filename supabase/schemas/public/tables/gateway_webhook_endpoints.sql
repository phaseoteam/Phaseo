CREATE TABLE "public"."gateway_webhook_endpoints" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"       uuid                     NOT NULL,
  "name"               text                     NOT NULL,
  "url"                text                     NOT NULL,
  "status"             text                     NOT NULL DEFAULT 'active'::text,
  "events"             text[]                   NOT NULL DEFAULT ARRAY['video.completed'::text,
  'video.failed'::text,
  'video.cancelled'::text,
  'batch.completed'::text,
  'batch.failed'::text,
  'batch.cancelled'::text],
  "secret_ciphertext"  text                     NOT NULL,
  "secret_iv"          text                     NOT NULL,
  "secret_hash"        text                     NOT NULL,
  "created_by"         uuid,
  "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at"         timestamp with time zone,
  "secret_key_version" text,
  CONSTRAINT "gateway_webhook_endpoints_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "gateway_webhook_endpoints_pkey" PRIMARY KEY (id),
  CONSTRAINT "gateway_webhook_endpoints_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'disabled'::text, 'deleted'::text]))),
  CONSTRAINT "gateway_webhook_endpoints_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."gateway_webhook_endpoints"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX gateway_webhook_endpoints_created_by_idx ON public.gateway_webhook_endpoints USING btree (created_by);

CREATE UNIQUE INDEX gateway_webhook_endpoints_workspace_secret_hash_idx ON public.gateway_webhook_endpoints USING btree (workspace_id, secret_hash);

CREATE INDEX gateway_webhook_endpoints_workspace_status_idx ON public.gateway_webhook_endpoints USING btree (workspace_id, status, created_at DESC);

CREATE POLICY "gateway_webhook_endpoints_insert_workspace_admins" ON "public"."gateway_webhook_endpoints"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (public.is_workspace_admin(workspace_id));

CREATE POLICY "gateway_webhook_endpoints_select_workspace_members" ON "public"."gateway_webhook_endpoints"
  FOR SELECT
  TO "authenticated"
  USING (((EXISTS ( SELECT 1
   FROM public.workspace_members wm
  WHERE ((wm.workspace_id = gateway_webhook_endpoints.workspace_id) AND (wm.user_id = ( SELECT auth.uid() AS uid))))) OR public.is_workspace_admin(workspace_id)));

CREATE POLICY "gateway_webhook_endpoints_update_workspace_admins" ON "public"."gateway_webhook_endpoints"
  FOR UPDATE
  TO "authenticated"
  USING (public.is_workspace_admin(workspace_id))
  WITH CHECK (public.is_workspace_admin(workspace_id));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."gateway_webhook_endpoints" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."gateway_webhook_endpoints" TO "service_role";

COMMENT ON COLUMN "public"."gateway_webhook_endpoints"."secret_ciphertext" IS 'Encrypted signing secret. Public API responses must never expose this value.';

COMMENT ON COLUMN "public"."gateway_webhook_endpoints"."secret_key_version" IS 'Version identifier for the dedicated async webhook secret encryption key.';

COMMENT ON TABLE "public"."gateway_webhook_endpoints" IS 'Workspace-managed async webhook endpoints for video and batch notifications.';

REVOKE ALL ON TABLE "public"."gateway_webhook_endpoints" FROM "authenticated";

REVOKE ALL ("created_at") ON TABLE "public"."gateway_webhook_endpoints" FROM "authenticated";

GRANT SELECT ("created_at") ON TABLE "public"."gateway_webhook_endpoints" TO "authenticated";

REVOKE ALL ("created_by") ON TABLE "public"."gateway_webhook_endpoints" FROM "authenticated";

GRANT SELECT ("created_by") ON TABLE "public"."gateway_webhook_endpoints" TO "authenticated";

REVOKE ALL ("deleted_at") ON TABLE "public"."gateway_webhook_endpoints" FROM "authenticated";

GRANT SELECT ("deleted_at") ON TABLE "public"."gateway_webhook_endpoints" TO "authenticated";

REVOKE ALL ("events") ON TABLE "public"."gateway_webhook_endpoints" FROM "authenticated";

GRANT SELECT ("events") ON TABLE "public"."gateway_webhook_endpoints" TO "authenticated";

REVOKE ALL ("id") ON TABLE "public"."gateway_webhook_endpoints" FROM "authenticated";

GRANT SELECT ("id") ON TABLE "public"."gateway_webhook_endpoints" TO "authenticated";

REVOKE ALL ("name") ON TABLE "public"."gateway_webhook_endpoints" FROM "authenticated";

GRANT SELECT ("name") ON TABLE "public"."gateway_webhook_endpoints" TO "authenticated";

REVOKE ALL ("status") ON TABLE "public"."gateway_webhook_endpoints" FROM "authenticated";

GRANT SELECT ("status") ON TABLE "public"."gateway_webhook_endpoints" TO "authenticated";

REVOKE ALL ("updated_at") ON TABLE "public"."gateway_webhook_endpoints" FROM "authenticated";

GRANT SELECT ("updated_at") ON TABLE "public"."gateway_webhook_endpoints" TO "authenticated";

REVOKE ALL ("url") ON TABLE "public"."gateway_webhook_endpoints" FROM "authenticated";

GRANT SELECT ("url") ON TABLE "public"."gateway_webhook_endpoints" TO "authenticated";

REVOKE ALL ("workspace_id") ON TABLE "public"."gateway_webhook_endpoints" FROM "authenticated";

GRANT SELECT ("workspace_id") ON TABLE "public"."gateway_webhook_endpoints" TO "authenticated";

GRANT DELETE, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."gateway_webhook_endpoints" TO "authenticated";
