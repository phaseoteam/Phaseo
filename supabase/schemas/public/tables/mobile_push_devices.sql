CREATE TABLE "public"."mobile_push_devices" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"         uuid                     NOT NULL,
  "installation_id" text                     NOT NULL,
  "expo_push_token" text                     NOT NULL,
  "platform"        text                     NOT NULL,
  "status"          text                     NOT NULL DEFAULT 'active'::text,
  "last_seen_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "invalidated_at"  timestamp with time zone,
  "time_zone"       text,
  "device_name"     text,
  "app_version"     text,
  CONSTRAINT "mobile_push_devices_app_version_check" CHECK (((app_version IS NULL) OR ((char_length(app_version) >= 1) AND (char_length(app_version) <= 40)))),
  CONSTRAINT "mobile_push_devices_device_name_check" CHECK (((device_name IS NULL) OR ((char_length(device_name) >= 1) AND (char_length(device_name) <= 100)))),
  CONSTRAINT "mobile_push_devices_expo_push_token_check" CHECK ((expo_push_token ~ '^Expo(nent)?PushToken[[][A-Za-z0-9_-]+[]]$'::text)),
  CONSTRAINT "mobile_push_devices_expo_push_token_key" UNIQUE (expo_push_token),
  CONSTRAINT "mobile_push_devices_installation_id_check" CHECK (((char_length(installation_id) >= 8) AND (char_length(installation_id) <= 200))),
  CONSTRAINT "mobile_push_devices_pkey" PRIMARY KEY (id),
  CONSTRAINT "mobile_push_devices_platform_check" CHECK ((platform = ANY (ARRAY['android'::text, 'ios'::text]))),
  CONSTRAINT "mobile_push_devices_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'disabled'::text, 'invalid'::text]))),
  CONSTRAINT "mobile_push_devices_time_zone_check" CHECK (((time_zone IS NULL) OR ((char_length(time_zone) >= 1) AND (char_length(time_zone) <= 64)))),
  CONSTRAINT "mobile_push_devices_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "mobile_push_devices_user_id_installation_id_key" UNIQUE (user_id, installation_id)
);

ALTER TABLE "public"."mobile_push_devices"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX mobile_push_devices_user_status_idx ON public.mobile_push_devices USING btree (user_id, status, last_seen_at DESC);

CREATE POLICY "deny_direct_client_access" ON "public"."mobile_push_devices"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON COLUMN "public"."mobile_push_devices"."time_zone" IS 'IANA time zone reported by the app, used for quiet hours. Null means UTC.';

COMMENT ON TABLE "public"."mobile_push_devices" IS 'Expo push tokens scoped to an authenticated user and app installation.';

REVOKE ALL ON TABLE "public"."mobile_push_devices" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."mobile_push_devices" TO "service_role";

REVOKE ALL ON TABLE "public"."mobile_push_devices" FROM "anon", "authenticated";
