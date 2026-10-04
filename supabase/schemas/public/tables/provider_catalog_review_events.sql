CREATE TABLE "public"."provider_catalog_review_events" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "run_id"        uuid                     NOT NULL,
  "model_slug"    text                     NOT NULL,
  "decision"      text                     NOT NULL,
  "reason"        text,
  "actor_user_id" uuid,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "provider_catalog_review_events_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "provider_catalog_review_events_decision_check" CHECK ((decision = ANY (ARRAY['approved'::text, 'rejected'::text, 'needs_changes'::text]))),
  CONSTRAINT "provider_catalog_review_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "provider_catalog_review_events_reason_check" CHECK (((decision = 'approved'::text) OR (NULLIF(TRIM(BOTH FROM reason), ''::text) IS NOT NULL))),
  CONSTRAINT "provider_catalog_review_events_run_id_fkey" FOREIGN KEY (run_id) REFERENCES public.provider_catalog_sync_runs(id) ON DELETE RESTRICT
);

ALTER TABLE "public"."provider_catalog_review_events"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX provider_catalog_review_events_actor_user_id_idx ON public.provider_catalog_review_events USING btree (actor_user_id);

CREATE INDEX provider_catalog_review_events_run_idx ON public.provider_catalog_review_events USING btree (run_id, created_at DESC);

CREATE POLICY "deny_direct_client_access" ON "public"."provider_catalog_review_events"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."provider_catalog_review_events" IS 'Append-only audit history for provider catalog review decisions.';

REVOKE ALL ON TABLE "public"."provider_catalog_review_events" FROM "service_role";

GRANT INSERT, SELECT ON TABLE "public"."provider_catalog_review_events" TO "service_role";

REVOKE ALL ON TABLE "public"."provider_catalog_review_events" FROM "anon", "authenticated";
