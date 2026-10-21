CREATE TABLE "public"."catalogue_notification_cursors" (
  "source"                text                     NOT NULL,
  "last_history_event_id" bigint                   NOT NULL DEFAULT 0,
  "checkpoint_event_id"   bigint,
  "checkpoint_xmax"       bigint,
  "updated_at"            timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "catalogue_notification_cursors_checkpoint_check" CHECK (((checkpoint_event_id IS NULL) = (checkpoint_xmax IS NULL))),
  CONSTRAINT "catalogue_notification_cursors_pkey" PRIMARY KEY (source)
);

ALTER TABLE "public"."catalogue_notification_cursors"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_direct_client_access" ON "public"."catalogue_notification_cursors"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON COLUMN "public"."catalogue_notification_cursors"."checkpoint_event_id" IS 'History sequence position recorded by the previous capture. Rows up to it are read once every transaction older than checkpoint_xmax has finished, so rows committed out of id order are never skipped.';

COMMENT ON TABLE "public"."catalogue_notification_cursors" IS 'Read positions of capture_catalogue_notification_events in its append-only sources.';

REVOKE ALL ON TABLE "public"."catalogue_notification_cursors" FROM "service_role";

GRANT SELECT ON TABLE "public"."catalogue_notification_cursors" TO "service_role";

REVOKE ALL ON TABLE "public"."catalogue_notification_cursors" FROM "anon", "authenticated";
