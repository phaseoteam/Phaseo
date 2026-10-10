CREATE TABLE "public"."provider_catalog_sources" (
  "provider_slug"             text                     NOT NULL,
  "catalog_url"               text,
  "status"                    text                     NOT NULL DEFAULT 'active'::text,
  "delivery_mode"             text                     NOT NULL DEFAULT 'webhook_and_polling'::text,
  "poll_interval_seconds"     integer                  NOT NULL DEFAULT 21600,
  "next_poll_at"              timestamp with time zone DEFAULT now(),
  "last_polled_at"            timestamp with time zone,
  "last_success_at"           timestamp with time zone,
  "last_http_status"          integer,
  "last_catalog_sha256"       text,
  "consecutive_failures"      integer                  NOT NULL DEFAULT 0,
  "last_error"                text,
  "etag"                      text,
  "last_modified"             text,
  "webhook_secret_ciphertext" text,
  "webhook_secret_iv"         text,
  "webhook_secret_hash"       text,
  "webhook_secret_version"    text                     NOT NULL DEFAULT 'v1'::text,
  "created_by"                uuid,
  "created_at"                timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"                timestamp with time zone NOT NULL DEFAULT now(),
  "sync_lease_token"          uuid,
  "sync_lease_expires_at"     timestamp with time zone,
  "refresh_requested"         boolean                  NOT NULL DEFAULT false,
  "management_mode"           text                     NOT NULL DEFAULT 'remote'::text,
  "managed_catalog"           jsonb,
  "managed_updated_by"        uuid,
  "managed_updated_at"        timestamp with time zone,
  "feed_models"               jsonb,
  "catalog_overrides"         jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "overrides_updated_at"      timestamp with time zone,
  "catalog_updated_at"        timestamp with time zone,
  "rate_limits_updated_at"    timestamp with time zone,
  CONSTRAINT "provider_catalog_sources_feed_models_check" CHECK (jsonb_typeof(feed_models) = 'array'),
  CONSTRAINT "provider_catalog_sources_overrides_check" CHECK (jsonb_typeof(catalog_overrides) = 'object'),
  CONSTRAINT "provider_catalog_sources_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "provider_catalog_sources_delivery_mode_check" CHECK ((delivery_mode = ANY (ARRAY['polling'::text, 'webhook_and_polling'::text]))),
  CONSTRAINT "provider_catalog_sources_failures_check" CHECK ((consecutive_failures >= 0)),
  CONSTRAINT "provider_catalog_sources_managed_catalog_check" CHECK (((managed_catalog IS NULL) OR (jsonb_typeof(managed_catalog) = 'object'::text))),
  CONSTRAINT "provider_catalog_sources_managed_updated_by_fkey" FOREIGN KEY (managed_updated_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "provider_catalog_sources_management_mode_check" CHECK ((management_mode = ANY (ARRAY['remote'::text, 'managed'::text]))),
  CONSTRAINT "provider_catalog_sources_pkey" PRIMARY KEY (provider_slug),
  CONSTRAINT "provider_catalog_sources_poll_interval_check" CHECK (((poll_interval_seconds >= 60) AND (poll_interval_seconds <= 86400))),
  CONSTRAINT "provider_catalog_sources_remote_url_required" CHECK (((management_mode = 'managed'::text) OR (catalog_url IS NOT NULL))),
  CONSTRAINT "provider_catalog_sources_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'disabled'::text]))),
  CONSTRAINT "provider_catalog_sources_provider_slug_fkey" FOREIGN KEY (provider_slug) REFERENCES public.v2_providers(provider_slug) ON DELETE CASCADE
);

ALTER TABLE "public"."provider_catalog_sources"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX provider_catalog_sources_created_by_idx ON public.provider_catalog_sources USING btree (created_by);

CREATE INDEX provider_catalog_sources_management_mode_idx ON public.provider_catalog_sources USING btree (management_mode, updated_at DESC);

CREATE INDEX provider_catalog_sources_poll_idx ON public.provider_catalog_sources USING btree (next_poll_at)
  WHERE (status = 'active'::text);

CREATE TRIGGER provider_catalog_source_owner_limit
  BEFORE INSERT ON public.provider_catalog_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_provider_catalog_source_owner_limit();

CREATE POLICY "deny_direct_client_access" ON "public"."provider_catalog_sources"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON COLUMN "public"."provider_catalog_sources"."managed_catalog" IS 'Provider-managed catalog document in the validated {data: [...]} contract shape.';

COMMENT ON COLUMN "public"."provider_catalog_sources"."management_mode" IS 'Catalog authority: remote provider URL or a provider-managed Phaseo document.';

COMMENT ON COLUMN "public"."provider_catalog_sources"."rate_limits_updated_at" IS 'Version of the provider-declared provider_rate_limits rows; null until the provider first declares limits.';

COMMENT ON TABLE "public"."provider_catalog_sources" IS 'Provider-owned catalog source configuration with webhook and polling state.';

REVOKE ALL ON TABLE "public"."provider_catalog_sources" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."provider_catalog_sources" TO "service_role";

REVOKE ALL ON TABLE "public"."provider_catalog_sources" FROM "anon", "authenticated";
