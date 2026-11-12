CREATE TABLE "public"."v2_provider_country_restrictions" (
  "restriction_id" uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "provider_slug"  text                     NOT NULL,
  "country_code"   text                     NOT NULL,
  "reason"         text,
  "source_url"     text,
  "effective_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at"     timestamp with time zone,
  "enabled"        boolean                  NOT NULL DEFAULT true,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_provider_country_restrictions_country_check" CHECK ((country_code ~ '^[A-Z]{2}$'::text)),
  CONSTRAINT "v2_provider_country_restrictions_pkey" PRIMARY KEY (restriction_id),
  CONSTRAINT "v2_provider_country_restrictions_unique" UNIQUE (provider_slug, country_code, effective_at),
  CONSTRAINT "v2_provider_country_restrictions_window_check" CHECK (((expires_at IS NULL) OR (expires_at > effective_at))),
  CONSTRAINT "v2_provider_country_restrictions_provider_slug_fkey" FOREIGN KEY (provider_slug) REFERENCES public.v2_providers(provider_slug) ON DELETE CASCADE
);

ALTER TABLE "public"."v2_provider_country_restrictions"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX v2_provider_country_restrictions_lookup_idx ON public.v2_provider_country_restrictions USING btree (provider_slug, country_code, effective_at DESC)
  WHERE enabled;

CREATE POLICY "service_role_full_access" ON "public"."v2_provider_country_restrictions"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_provider_country_restrictions" TO "service_role";

REVOKE ALL ON TABLE "public"."v2_provider_country_restrictions" FROM "anon", "authenticated";
