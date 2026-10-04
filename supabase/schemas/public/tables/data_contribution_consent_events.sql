CREATE TABLE "public"."data_contribution_consent_events" (
  "id"                         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"               uuid                     NOT NULL,
  "actor_type"                 text                     NOT NULL,
  "actor_user_id"              uuid,
  "actor_key_id"               uuid,
  "action"                     text                     NOT NULL,
  "outcome"                    text                     NOT NULL,
  "policy_version"             text                     NOT NULL,
  "sample_rate_bps"            integer                  NOT NULL,
  "classifier_sample_rate_bps" integer                  NOT NULL,
  "discount_bps"               integer                  NOT NULL,
  "reason"                     text,
  "created_at"                 timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "data_contribution_consent_even_classifier_sample_rate_bps_check" CHECK (((classifier_sample_rate_bps >= 0) AND (classifier_sample_rate_bps <= 10000))),
  CONSTRAINT "data_contribution_consent_events_action_check" CHECK ((action = ANY (ARRAY['enabled'::text, 'disabled'::text, 'change_denied'::text]))),
  CONSTRAINT "data_contribution_consent_events_actor_type_check" CHECK ((actor_type = ANY (ARRAY['user'::text, 'management_key'::text, 'system'::text]))),
  CONSTRAINT "data_contribution_consent_events_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "data_contribution_consent_events_discount_bps_check" CHECK (((discount_bps >= 0) AND (discount_bps <= 10000))),
  CONSTRAINT "data_contribution_consent_events_outcome_check" CHECK ((outcome = ANY (ARRAY['succeeded'::text, 'denied'::text, 'failed'::text]))),
  CONSTRAINT "data_contribution_consent_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "data_contribution_consent_events_sample_rate_bps_check" CHECK (((sample_rate_bps >= 0) AND (sample_rate_bps <= 10000))),
  CONSTRAINT "data_contribution_consent_events_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."data_contribution_consent_events"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX data_contribution_consent_actor_user_idx ON public.data_contribution_consent_events USING btree (actor_user_id, created_at DESC)
  WHERE (actor_user_id IS NOT NULL);

CREATE INDEX data_contribution_consent_workspace_created_idx ON public.data_contribution_consent_events USING btree (workspace_id, created_at DESC);

CREATE POLICY "service_role_full_access" ON "public"."data_contribution_consent_events"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."data_contribution_consent_events" TO "service_role";

COMMENT ON TABLE "public"."data_contribution_consent_events" IS 'Unsampled, content-free audit trail for contribution consent changes.';

REVOKE ALL ON TABLE "public"."data_contribution_consent_events" FROM "anon", "authenticated";
