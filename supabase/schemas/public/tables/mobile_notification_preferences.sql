CREATE TABLE "public"."mobile_notification_preferences" (
  "user_id"                    uuid                     NOT NULL,
  "new_model_releases_enabled" boolean                  NOT NULL DEFAULT false,
  "created_at"                 timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"                 timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "mobile_notification_preferences_pkey" PRIMARY KEY (user_id),
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

COMMENT ON TABLE "public"."mobile_notification_preferences" IS 'Per-user opt-in preferences for native mobile push notifications.';

REVOKE ALL ON TABLE "public"."mobile_notification_preferences" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."mobile_notification_preferences" TO "service_role";

REVOKE ALL ON TABLE "public"."mobile_notification_preferences" FROM "anon", "authenticated";
