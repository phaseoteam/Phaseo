CREATE TABLE "public"."model_discovery_review_items" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "dedupe_key"        text                     NOT NULL,
  "run_id"            uuid,
  "source"            text                     NOT NULL,
  "provider_id"       text                     NOT NULL,
  "provider_name"     text                     NOT NULL,
  "model_id"          text                     NOT NULL,
  "change_type"       text                     NOT NULL,
  "details"           jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "status"            text                     NOT NULL DEFAULT 'pending'::text,
  "first_detected_at" timestamp with time zone NOT NULL DEFAULT now(),
  "last_detected_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "reviewed_by"       uuid,
  "reviewed_at"       timestamp with time zone,
  "review_note"       text,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "model_discovery_review_items_change_type_check" CHECK ((change_type = ANY (ARRAY['added'::text, 'removed'::text]))),
  CONSTRAINT "model_discovery_review_items_dedupe_key_unique" UNIQUE (dedupe_key),
  CONSTRAINT "model_discovery_review_items_model_id_check" CHECK ((NULLIF(TRIM(BOTH FROM model_id), ''::text) IS NOT NULL)),
  CONSTRAINT "model_discovery_review_items_pkey" PRIMARY KEY (id),
  CONSTRAINT "model_discovery_review_items_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "model_discovery_review_items_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'approved'::text, 'rejected'::text, 'snoozed'::text]))),
  CONSTRAINT "model_discovery_review_items_run_id_fkey" FOREIGN KEY (run_id) REFERENCES public.model_discovery_runs(id) ON DELETE SET NULL
);

ALTER TABLE "public"."model_discovery_review_items"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX model_discovery_review_items_provider_idx ON public.model_discovery_review_items USING btree (provider_id, last_detected_at DESC);

CREATE INDEX model_discovery_review_items_status_idx ON public.model_discovery_review_items USING btree (status, last_detected_at DESC);

CREATE POLICY "deny_direct_client_access" ON "public"."model_discovery_review_items"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."model_discovery_review_items" TO "service_role";

COMMENT ON TABLE "public"."model_discovery_review_items" IS 'Internal review queue for provider model additions and confirmed removals detected by the Cloudflare watcher.';

REVOKE ALL ON TABLE "public"."model_discovery_review_items" FROM "anon", "authenticated";
