CREATE TABLE "public"."model_discovery_pricing_pages" (
  "provider_id"   text                     NOT NULL,
  "source_url"    text                     NOT NULL,
  "fingerprint"   text                     NOT NULL,
  "content_lines" jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "updated_at"    timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  "recent_fingerprints" jsonb             NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT "model_discovery_pricing_pages_pkey" PRIMARY KEY (provider_id)
);

COMMENT ON COLUMN "public"."model_discovery_pricing_pages"."recent_fingerprints" IS 'Fingerprints this page had before the current one, newest first, capped by the model watcher. A page that returns to one of them is not reported as a pricing change.';

ALTER TABLE "public"."model_discovery_pricing_pages"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_direct_client_access" ON "public"."model_discovery_pricing_pages"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE "public"."model_discovery_pricing_pages" FROM "service_role";

GRANT INSERT, SELECT, UPDATE ON TABLE "public"."model_discovery_pricing_pages" TO "service_role";

REVOKE ALL ON TABLE "public"."model_discovery_pricing_pages" FROM "anon", "authenticated";
