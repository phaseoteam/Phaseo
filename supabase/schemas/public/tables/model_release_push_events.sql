CREATE TABLE "public"."model_release_push_events" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "model_slug"      text                     NOT NULL,
  "model_name"      text                     NOT NULL,
  "lab_name"        text                     NOT NULL,
  "released_at"     timestamp with time zone,
  "status"          text                     NOT NULL DEFAULT 'pending'::text,
  "next_attempt_at" timestamp with time zone NOT NULL DEFAULT now(),
  "attempts"        integer                  NOT NULL DEFAULT 0,
  "last_error"      text,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "completed_at"    timestamp with time zone,
  CONSTRAINT "model_release_push_events_attempts_check" CHECK ((attempts >= 0)),
  CONSTRAINT "model_release_push_events_model_slug_key" UNIQUE (model_slug),
  CONSTRAINT "model_release_push_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "model_release_push_events_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'complete'::text, 'failed'::text]))),
  CONSTRAINT "model_release_push_events_model_slug_fkey" FOREIGN KEY (model_slug) REFERENCES public.v2_models(model_slug) ON DELETE CASCADE
);

ALTER TABLE "public"."model_release_push_events"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX model_release_push_events_pending_idx ON public.model_release_push_events USING btree (status, next_attempt_at, created_at)
  WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text]));

CREATE POLICY "deny_direct_client_access" ON "public"."model_release_push_events"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."model_release_push_events" IS 'Deduplicated queue of models becoming publicly available after this feature was deployed.';

REVOKE ALL ON TABLE "public"."model_release_push_events" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."model_release_push_events" TO "service_role";

REVOKE ALL ON TABLE "public"."model_release_push_events" FROM "anon", "authenticated";
