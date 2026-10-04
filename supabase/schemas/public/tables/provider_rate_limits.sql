CREATE TABLE "public"."provider_rate_limits" (
  "provider_id"         text                     NOT NULL,
  "requests_per_minute" bigint,
  "requests_per_day"    bigint,
  "tokens_per_minute"   bigint,
  "tokens_per_day"      bigint,
  "headroom_bps"        integer                  NOT NULL DEFAULT 500,
  "enabled"             boolean                  NOT NULL DEFAULT true,
  "created_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"          timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "provider_rate_limits_has_limit" CHECK (((requests_per_minute IS NOT NULL) OR (requests_per_day IS NOT NULL) OR (tokens_per_minute IS NOT NULL) OR (tokens_per_day IS
    NOT NULL))),
  CONSTRAINT "provider_rate_limits_headroom_bps_range" CHECK (((headroom_bps >= 0) AND (headroom_bps <= 5000))),
  CONSTRAINT "provider_rate_limits_pkey" PRIMARY KEY (provider_id),
  CONSTRAINT "provider_rate_limits_requests_per_day_positive" CHECK (((requests_per_day IS NULL) OR (requests_per_day > 0))),
  CONSTRAINT "provider_rate_limits_requests_per_minute_positive" CHECK (((requests_per_minute IS NULL) OR (requests_per_minute > 0))),
  CONSTRAINT "provider_rate_limits_tokens_per_day_positive" CHECK (((tokens_per_day IS NULL) OR (tokens_per_day > 0))),
  CONSTRAINT "provider_rate_limits_tokens_per_minute_positive" CHECK (((tokens_per_minute IS NULL) OR (tokens_per_minute > 0))),
  CONSTRAINT "provider_rate_limits_provider_id_fkey" FOREIGN KEY (provider_id) REFERENCES public.v2_providers(provider_slug) ON UPDATE CASCADE ON DELETE CASCADE
);

ALTER TABLE "public"."provider_rate_limits"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_direct_client_access" ON "public"."provider_rate_limits"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON COLUMN "public"."provider_rate_limits"."headroom_bps" IS 'Capacity held back to absorb token usage from requests that are still in flight.';

COMMENT ON TABLE "public"."provider_rate_limits" IS 'Gateway-managed upstream provider capacity limits. Enforcement is approximate and scoped to the managed provider credential.';

REVOKE ALL ON TABLE "public"."provider_rate_limits" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."provider_rate_limits" TO "service_role";

REVOKE ALL ON TABLE "public"."provider_rate_limits" FROM "anon", "authenticated";
