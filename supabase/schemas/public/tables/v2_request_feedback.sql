CREATE TABLE "public"."v2_request_feedback" (
  "feedback_id"      uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "request_event_id" uuid                     NOT NULL,
  "workspace_id"     uuid                     NOT NULL,
  "feedback_type"    text                     NOT NULL,
  "value"            text                     NOT NULL,
  "score"            numeric(10,4),
  "source"           text                     NOT NULL DEFAULT 'user'::text,
  "metadata"         jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_request_feedback_pkey" PRIMARY KEY (feedback_id),
  CONSTRAINT "v2_request_feedback_request_event_id_fkey" FOREIGN KEY (request_event_id) REFERENCES public.v2_request_facts(request_event_id) ON DELETE CASCADE,
  CONSTRAINT "v2_request_feedback_score_check" CHECK (((score IS NULL) OR ((score >= ('-1'::integer)::numeric) AND (score <= (1)::numeric)))),
  CONSTRAINT "v2_request_feedback_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."v2_request_feedback"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX v2_request_feedback_request_idx ON public.v2_request_feedback USING btree (request_event_id, created_at DESC);

CREATE INDEX v2_request_feedback_workspace_time_idx ON public.v2_request_feedback USING btree (workspace_id, created_at DESC);

CREATE POLICY "v2_request_feedback_workspace_select" ON "public"."v2_request_feedback"
  FOR SELECT
  TO "authenticated"
  USING (( SELECT public.is_workspace_member(v2_request_feedback.workspace_id) AS is_workspace_member));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_request_feedback" TO "anon", "authenticated", "service_role";
