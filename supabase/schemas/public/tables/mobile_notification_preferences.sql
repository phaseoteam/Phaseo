CREATE TABLE "public"."mobile_notification_preferences" (
  "user_id"                    uuid                       NOT NULL,
  "new_model_releases_enabled" boolean                    NOT NULL DEFAULT false,
  "created_at"                 timestamp with time zone   NOT NULL DEFAULT now(),
  "updated_at"                 timestamp with time zone   NOT NULL DEFAULT now(),
  "enabled"                    boolean                    NOT NULL DEFAULT false,
  "quiet_start"                time without time zone,
  "quiet_end"                  time without time zone,
  "daily_cap"                  integer                    NOT NULL DEFAULT 10,
  "test_push_sent_at"          timestamp with time zone[] NOT NULL DEFAULT '{}'::timestamp with time zone[],
  CONSTRAINT "mobile_notification_preferences_daily_cap_check" CHECK (((daily_cap >= 1) AND (daily_cap <= 100))),
  CONSTRAINT "mobile_notification_preferences_pkey" PRIMARY KEY (user_id),
  CONSTRAINT "mobile_notification_preferences_quiet_hours_check"
    CHECK ((((quiet_start IS NULL) AND (quiet_end IS NULL)) OR ((quiet_start IS NOT NULL) AND (quiet_end IS NOT NULL) AND (quiet_start <> quiet_end)))),
  CONSTRAINT "mobile_notification_preferences_test_push_sent_at_check" CHECK ((cardinality(test_push_sent_at) <= 10)),
  CONSTRAINT "mobile_notification_preferences_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE "public"."mobile_notification_preferences"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_direct_client_access" ON "public"."mobile_notification_preferences"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON COLUMN "public"."mobile_notification_preferences"."daily_cap" IS 'Most catalogue notifications a user receives in any 24 hours; later ones are recorded as suppressed.';

COMMENT ON COLUMN "public"."mobile_notification_preferences"."enabled" IS 'Master switch for mobile push. Which events notify is decided by mobile_notification_rules.';

COMMENT ON COLUMN "public"."mobile_notification_preferences"."new_model_releases_enabled" IS 'Legacy opt-in from the August 2026 attempt. Superseded by enabled and mobile_notification_rules; nothing reads it.';

COMMENT ON COLUMN "public"."mobile_notification_preferences"."quiet_end" IS 'Local time, in each device''s time zone, when held notifications are released.';

COMMENT ON COLUMN "public"."mobile_notification_preferences"."quiet_start" IS 'Local time, in each device''s time zone, from which notifications are held. A start later than the end wraps past midnight.';

COMMENT ON COLUMN "public"."mobile_notification_preferences"."test_push_sent_at" IS 'Recent test pushes, used to rate limit them.';

COMMENT ON TABLE "public"."mobile_notification_preferences" IS 'Per-user mobile push settings: master switch, quiet hours and daily cap.';

REVOKE ALL ON TABLE "public"."mobile_notification_preferences" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."mobile_notification_preferences" TO "service_role";

REVOKE ALL ON TABLE "public"."mobile_notification_preferences" FROM "anon", "authenticated";
