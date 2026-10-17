CREATE TABLE "public"."catalogue_notification_skipped_transactions" (
  "transaction_id"         bigint                   NOT NULL,
  "model_count"            integer                  NOT NULL,
  "row_count"              integer                  NOT NULL,
  "first_history_event_id" bigint                   NOT NULL,
  "recorded_at"            timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "catalogue_notification_skipped_transactions_pkey" PRIMARY KEY (transaction_id)
);

ALTER TABLE "public"."catalogue_notification_skipped_transactions"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_direct_client_access" ON "public"."catalogue_notification_skipped_transactions"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."catalogue_notification_skipped_transactions" IS 'Catalogue transactions that touched too many models to be news (bulk syncs, backfills). Their history rows produce no notification events.';

REVOKE ALL ON TABLE "public"."catalogue_notification_skipped_transactions" FROM "service_role";

GRANT SELECT ON TABLE "public"."catalogue_notification_skipped_transactions" TO "service_role";

REVOKE ALL ON TABLE "public"."catalogue_notification_skipped_transactions" FROM "anon", "authenticated";
