CREATE TABLE "public"."catalogue_notification_events" (
  "id"                      uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "kind"                    text                     NOT NULL,
  "dedupe_key"              text                     NOT NULL,
  "model_slug"              text,
  "lab_slug"                text,
  "provider_slug"           text,
  "title"                   text                     NOT NULL,
  "body"                    text                     NOT NULL,
  "href"                    text                     NOT NULL,
  "payload"                 jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "source_history_event_id" bigint,
  "occurred_at"             timestamp with time zone NOT NULL DEFAULT now(),
  "fanned_out_at"           timestamp with time zone,
  "created_at"              timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "catalogue_notification_events_body_check" CHECK ((char_length(body) <= 1000)),
  CONSTRAINT "catalogue_notification_events_dedupe_key_key" UNIQUE (dedupe_key),
  CONSTRAINT "catalogue_notification_events_kind_check"
    CHECK
    ((kind = ANY (ARRAY['model_released'::text, 'gateway_available'::text, 'price_changed'::text, 'deprecation_announced'::text, 'provider_added'::text,
    'provider_launched'::text]))),
  CONSTRAINT "catalogue_notification_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "catalogue_notification_events_title_check" CHECK (((char_length(title) >= 1) AND (char_length(title) <= 300)))
);

ALTER TABLE "public"."catalogue_notification_events"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX catalogue_notification_events_model_idx ON public.catalogue_notification_events USING btree (model_slug, created_at DESC);

CREATE INDEX catalogue_notification_events_releases_idx ON public.catalogue_notification_events USING btree (occurred_at)
  WHERE (kind = ANY (ARRAY['model_released'::text, 'gateway_available'::text]));

CREATE INDEX catalogue_notification_events_unfanned_idx ON public.catalogue_notification_events USING btree (created_at, id)
  WHERE (fanned_out_at IS NULL);

CREATE POLICY "deny_direct_client_access" ON "public"."catalogue_notification_events"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."catalogue_notification_events" IS 'Channel-neutral public catalogue events (releases, Phaseo availability, price changes, deprecations, new providers for a model, providers launching on Phaseo), one per dedupe key. Mobile push fans them out to devices; other channels can read them too.';

REVOKE ALL ON TABLE "public"."catalogue_notification_events" FROM "service_role";

GRANT SELECT ON TABLE "public"."catalogue_notification_events" TO "service_role";

REVOKE ALL ON TABLE "public"."catalogue_notification_events" FROM "anon", "authenticated";
