CREATE TABLE "public"."gateway_feedback" (
  "id"                  uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"        uuid                     NOT NULL,
  "request_id"          text,
  "session_id"          text,
  "preset_id"           uuid,
  "test_run_id"         uuid,
  "source"              text                     NOT NULL DEFAULT 'api'::text,
  "rating"              text,
  "score"               numeric,
  "reason"              text,
  "reason_tags"         text[]                   NOT NULL DEFAULT '{}'::text[],
  "comment"             text,
  "metadata"            jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "metadata_dimensions" jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "end_user_id"         text,
  "created_by_user_id"  uuid,
  "created_at"          timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "gateway_feedback_metadata_dimensions_object_check" CHECK ((jsonb_typeof(metadata_dimensions) = 'object'::text)),
  CONSTRAINT "gateway_feedback_pkey" PRIMARY KEY (id),
  CONSTRAINT "gateway_feedback_rating_check"
    CHECK
    (((rating IS NULL) OR (rating = ANY (ARRAY['thumbs_up'::text, 'thumbs_down'::text, 'correct'::text, 'partly_correct'::text, 'incorrect'::text, 'bad_format'::text,
    'too_slow'::text, 'too_expensive'::text, 'unsafe'::text, 'refused_incorrectly'::text, 'not_helpful'::text, 'other'::text])))),
  CONSTRAINT "gateway_feedback_score_check" CHECK (((score IS NULL) OR ((score >= (0)::numeric) AND (score <= (1)::numeric)))),
  CONSTRAINT "gateway_feedback_source_check" CHECK ((source = ANY (ARRAY['api'::text, 'user'::text, 'system'::text, 'import'::text, 'test'::text]))),
  CONSTRAINT "gateway_feedback_target_check" CHECK (((request_id IS NOT NULL) OR (session_id IS NOT NULL) OR (preset_id IS NOT NULL) OR (test_run_id IS NOT NULL))),
  CONSTRAINT "gateway_feedback_test_run_id_fkey" FOREIGN KEY (test_run_id) REFERENCES public.gateway_preset_test_runs(id) ON DELETE SET NULL,
  CONSTRAINT "gateway_feedback_preset_id_fkey" FOREIGN KEY (preset_id) REFERENCES public.presets(id) ON DELETE SET NULL,
  CONSTRAINT "gateway_feedback_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."gateway_feedback"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX gateway_feedback_metadata_dimensions_idx ON public.gateway_feedback USING gin (metadata_dimensions jsonb_path_ops);

CREATE INDEX gateway_feedback_preset_created_idx ON public.gateway_feedback USING btree (workspace_id, preset_id, created_at DESC)
  WHERE (preset_id IS NOT NULL);

CREATE INDEX gateway_feedback_preset_id_idx ON public.gateway_feedback USING btree (preset_id);

CREATE INDEX gateway_feedback_request_created_idx ON public.gateway_feedback USING btree (workspace_id, request_id, created_at DESC)
  WHERE (request_id IS NOT NULL);

CREATE INDEX gateway_feedback_session_created_idx ON public.gateway_feedback USING btree (workspace_id, session_id, created_at DESC)
  WHERE (session_id IS NOT NULL);

CREATE INDEX gateway_feedback_test_run_created_idx ON public.gateway_feedback USING btree (workspace_id, test_run_id, created_at DESC)
  WHERE (test_run_id IS NOT NULL);

CREATE INDEX gateway_feedback_test_run_id_idx ON public.gateway_feedback USING btree (test_run_id);

CREATE INDEX gateway_feedback_workspace_created_idx ON public.gateway_feedback USING btree (workspace_id, created_at DESC);

CREATE INDEX gateway_feedback_workspace_created_preset_idx ON public.gateway_feedback USING btree (workspace_id, created_at DESC, preset_id)
  WHERE (preset_id IS NOT NULL);

CREATE INDEX gateway_feedback_workspace_preset_rating_created_idx ON public.gateway_feedback USING btree (workspace_id, preset_id, rating, created_at DESC)
  WHERE (preset_id IS NOT NULL);

CREATE POLICY "gateway_feedback_all_service" ON "public"."gateway_feedback"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "gateway_feedback_select_workspace" ON "public"."gateway_feedback"
  FOR SELECT
  TO "authenticated"
  USING (public.is_workspace_member(workspace_id));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."gateway_feedback" TO "authenticated", "service_role";

COMMENT ON COLUMN "public"."gateway_feedback"."metadata" IS 'Arbitrary developer-supplied feedback metadata. Use metadata_dimensions for bounded indexed cohort filters.';

COMMENT ON COLUMN "public"."gateway_feedback"."metadata_dimensions" IS 'Bounded flat string map for indexed preset feedback comparison filters such as user_tier, region, plan, cohort, or app_version.';

COMMENT ON INDEX "public"."gateway_feedback_workspace_created_preset_idx" IS 'Supports preset feedback comparison pages filtered by workspace and date range.';

COMMENT ON INDEX "public"."gateway_feedback_workspace_preset_rating_created_idx" IS 'Supports preset comparison summaries by rating within a workspace/date window.';

COMMENT ON TABLE "public"."gateway_feedback" IS 'Developer- and user-supplied feedback signals linked to gateway requests, sessions, presets, and preset test runs.';

REVOKE ALL ON TABLE "public"."gateway_feedback" FROM "anon";
