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
  "provider_model_slug" text                     NOT NULL DEFAULT '*'::text,
  CONSTRAINT "provider_rate_limits_has_limit" CHECK (((requests_per_minute IS NOT NULL) OR (requests_per_day IS NOT NULL) OR (tokens_per_minute IS NOT NULL) OR (tokens_per_day IS
    NOT NULL))),
  CONSTRAINT "provider_rate_limits_headroom_bps_range" CHECK (((headroom_bps >= 0) AND (headroom_bps <= 5000))),
  CONSTRAINT "provider_rate_limits_pkey" PRIMARY KEY (provider_id, provider_model_slug),
  CONSTRAINT "provider_rate_limits_provider_model_slug_not_blank" CHECK ((btrim(provider_model_slug) <> ''::text)),
  CONSTRAINT "provider_rate_limits_requests_per_day_positive" CHECK (((requests_per_day IS NULL) OR (requests_per_day > 0))),
  CONSTRAINT "provider_rate_limits_requests_per_minute_positive" CHECK (((requests_per_minute IS NULL) OR (requests_per_minute > 0))),
  CONSTRAINT "provider_rate_limits_tokens_per_day_positive" CHECK (((tokens_per_day IS NULL) OR (tokens_per_day > 0))),
  CONSTRAINT "provider_rate_limits_tokens_per_minute_positive" CHECK (((tokens_per_minute IS NULL) OR (tokens_per_minute > 0))),
  CONSTRAINT "provider_rate_limits_provider_id_fkey" FOREIGN KEY (provider_id) REFERENCES public.v2_providers(provider_slug) ON UPDATE CASCADE ON DELETE CASCADE
);

ALTER TABLE "public"."provider_rate_limits"
  ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER routing_catalogue_changed
  AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.provider_rate_limits
  FOR EACH STATEMENT
  EXECUTE FUNCTION private.invalidate_routing_catalogue();

CREATE POLICY "deny_direct_client_access" ON "public"."provider_rate_limits"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON COLUMN "public"."provider_rate_limits"."headroom_bps" IS 'Capacity held back to absorb token usage from requests that are still in flight.';

COMMENT ON COLUMN "public"."provider_rate_limits"."provider_model_slug" IS 'Upstream model id (v2_model_provider_routes.provider_model_slug) the limit applies to; ''*'' applies it across all of the provider''s models.';

COMMENT ON TABLE "public"."provider_rate_limits" IS 'Upstream provider capacity limits declared by each provider through its catalogue, counted globally across all users. A provider and model that reaches a limit is heavily deranked in routing rather than excluded.';

REVOKE ALL ON TABLE "public"."provider_rate_limits" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."provider_rate_limits" TO "service_role";

REVOKE ALL ON TABLE "public"."provider_rate_limits" FROM "anon", "authenticated";
