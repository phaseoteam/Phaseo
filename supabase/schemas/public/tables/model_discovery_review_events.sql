CREATE TABLE "public"."model_discovery_review_events" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "item_id"       uuid                     NOT NULL,
  "decision"      text                     NOT NULL,
  "reason"        text,
  "actor_user_id" uuid                     NOT NULL,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "model_discovery_review_events_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT,
  CONSTRAINT "model_discovery_review_events_decision_check" CHECK ((decision = ANY (ARRAY['in_progress'::text, 'approved'::text, 'rejected'::text, 'snoozed'::text]))),
  CONSTRAINT "model_discovery_review_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "model_discovery_review_events_reason_check" CHECK (((decision = ANY (ARRAY['in_progress'::text, 'approved'::text])) OR (NULLIF(TRIM(BOTH FROM reason), ''::text) IS
    NOT NULL))),
  CONSTRAINT "model_discovery_review_events_item_id_fkey" FOREIGN KEY (item_id) REFERENCES public.model_discovery_review_items(id) ON DELETE RESTRICT
);

ALTER TABLE "public"."model_discovery_review_events"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX model_discovery_review_events_item_idx ON public.model_discovery_review_events USING btree (item_id, created_at DESC);

CREATE POLICY "deny_direct_client_access" ON "public"."model_discovery_review_events"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."model_discovery_review_events" IS 'Append-only audit history for model-discovery review decisions.';

REVOKE ALL ON TABLE "public"."model_discovery_review_events" FROM "service_role";

GRANT INSERT, SELECT ON TABLE "public"."model_discovery_review_events" TO "service_role";

REVOKE ALL ON TABLE "public"."model_discovery_review_events" FROM "anon", "authenticated";
