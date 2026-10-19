CREATE TABLE "public"."workspace_notification_events" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"   uuid                     NOT NULL,
  "kind"           text                     NOT NULL,
  "category"       text                     NOT NULL,
  "dedupe_key"     text                     NOT NULL,
  "actor_user_id"  uuid,
  "key_id"         uuid,
  "key_created_by" uuid,
  "payload"        jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "occurred_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "fanned_out_at"  timestamp with time zone,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_notification_events_category_check"
    CHECK ((category = ANY (ARRAY['money'::text, 'traffic'::text, 'security'::text, 'deprecations'::text, 'jobs'::text, 'account'::text, 'digest'::text]))),
  CONSTRAINT "workspace_notification_events_dedupe_key_key" UNIQUE (dedupe_key),
  CONSTRAINT "workspace_notification_events_payload_check" CHECK ((jsonb_typeof(payload) = 'object'::text)),
  CONSTRAINT "workspace_notification_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "workspace_notification_events_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_notification_events"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_notification_events_open_idx ON public.workspace_notification_events USING btree (created_at, id)
  WHERE (fanned_out_at IS NULL);

CREATE INDEX workspace_notification_events_workspace_kind_idx ON public.workspace_notification_events USING btree (workspace_id, kind, occurred_at DESC);

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_notification_events"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON COLUMN "public"."workspace_notification_events"."actor_user_id" IS 'Who did what the event is about, when a person did it. That person is told "You …" instead of their own name.';

COMMENT ON COLUMN "public"."workspace_notification_events"."category" IS 'Mobile notification category and Android channel: money, traffic, security or deprecations so far.';

COMMENT ON COLUMN "public"."workspace_notification_events"."key_created_by" IS 'Creator of the API key the event is about. Besides owners and admins, they are told too, even as a plain member.';

COMMENT ON COLUMN "public"."workspace_notification_events"."payload" IS 'Facts the push text is written from for each recipient. Kinds that private.workspace_push_message does not write itself carry their own text in payload.push (title, body, href and lowerLead).';

COMMENT ON TABLE "public"."workspace_notification_events" IS 'Workspace events for mobile push (money, traffic, security and deprecation alerts), one per dedupe key, captured from email_outbox and workspace_audit_events or recorded directly. fan_out_workspace_push_events queues each for the devices of the members it concerns.';

REVOKE ALL ON TABLE "public"."workspace_notification_events" FROM "service_role";

GRANT SELECT ON TABLE "public"."workspace_notification_events" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_notification_events" FROM "anon", "authenticated";
