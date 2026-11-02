CREATE TABLE "public"."work_webhooks" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"      uuid                     NOT NULL,
  "url"               text                     NOT NULL,
  "secret_ciphertext" text                     NOT NULL,
  "events"            text[]                   NOT NULL DEFAULT ARRAY['created'::text, 'state'::text, 'comment'::text],
  "enabled"           boolean                  NOT NULL DEFAULT true,
  "cursor_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "cursor_id"         uuid,
  "failure_count"     integer                  NOT NULL DEFAULT 0,
  "last_status"       integer,
  "last_delivery_at"  timestamp with time zone,
  "created_by"        uuid,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_webhooks_url_check" CHECK (((url ~ '^https://'::text) AND (char_length(url) <= 2000))),
  CONSTRAINT "work_webhooks_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_webhooks_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "work_webhooks_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_webhooks"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX work_webhooks_enabled_idx ON public.work_webhooks USING btree (cursor_at)
  WHERE enabled;

CREATE POLICY "deny_direct_client_access" ON "public"."work_webhooks"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_webhooks" IS 'Webhooks for work item events. web-api''s cron sends each one the workspace''s new events after its cursor (signed with its secret, encrypted at rest) and moves the cursor on a 2xx answer. Turned off after 20 failures in a row.';

REVOKE ALL ON TABLE "public"."work_webhooks" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."work_webhooks" TO "service_role";

REVOKE ALL ON TABLE "public"."work_webhooks" FROM "anon", "authenticated";
