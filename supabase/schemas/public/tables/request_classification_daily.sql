CREATE TABLE "public"."request_classification_daily" (
  "usage_date"       date                     NOT NULL,
  "workspace_id"     uuid                     NOT NULL,
  "classifier_id"    uuid                     NOT NULL,
  "primary_category" text                     NOT NULL,
  "model_slug"       text                     NOT NULL,
  "provider_slug"    text                     NOT NULL DEFAULT ''::text,
  "request_count"    bigint                   NOT NULL DEFAULT 0,
  "input_tokens"     bigint                   NOT NULL DEFAULT 0,
  "output_tokens"    bigint                   NOT NULL DEFAULT 0,
  "updated_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "request_classification_daily_input_tokens_check" CHECK ((input_tokens >= 0)),
  CONSTRAINT "request_classification_daily_output_tokens_check" CHECK ((output_tokens >= 0)),
  CONSTRAINT "request_classification_daily_pkey" PRIMARY KEY (usage_date, workspace_id, classifier_id, primary_category, model_slug, provider_slug),
  CONSTRAINT "request_classification_daily_request_count_check" CHECK ((request_count >= 0)),
  CONSTRAINT "request_classification_daily_classifier_id_fkey" FOREIGN KEY (classifier_id) REFERENCES public.workspace_classifiers(id) ON DELETE CASCADE,
  CONSTRAINT "request_classification_daily_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."request_classification_daily"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX request_classification_daily_classifier_idx ON public.request_classification_daily USING btree (classifier_id, usage_date DESC);

CREATE INDEX request_classification_daily_public_rollup_idx ON public.request_classification_daily
  USING btree (usage_date, classifier_id, primary_category, model_slug, provider_slug, workspace_id) INCLUDE (request_count, input_tokens, output_tokens);

CREATE INDEX request_classification_daily_workspace_date_idx ON public.request_classification_daily USING btree (workspace_id, usage_date DESC);

CREATE POLICY "service_role_full_access" ON "public"."request_classification_daily"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."request_classification_daily" TO "service_role";

REVOKE ALL ON TABLE "public"."request_classification_daily" FROM "anon", "authenticated";
