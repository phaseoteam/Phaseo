CREATE TABLE "public"."public_model_task_daily" (
  "usage_date"       date                     NOT NULL,
  "taxonomy_slug"    text                     NOT NULL,
  "primary_category" text                     NOT NULL,
  "model_slug"       text                     NOT NULL,
  "provider_slug"    text                     NOT NULL DEFAULT ''::text,
  "workspace_count"  bigint                   NOT NULL DEFAULT 0,
  "request_count"    bigint                   NOT NULL DEFAULT 0,
  "input_tokens"     bigint                   NOT NULL DEFAULT 0,
  "output_tokens"    bigint                   NOT NULL DEFAULT 0,
  "updated_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "public_model_task_daily_input_tokens_check" CHECK ((input_tokens >= 0)),
  CONSTRAINT "public_model_task_daily_output_tokens_check" CHECK ((output_tokens >= 0)),
  CONSTRAINT "public_model_task_daily_pkey" PRIMARY KEY (usage_date, taxonomy_slug, primary_category, model_slug, provider_slug),
  CONSTRAINT "public_model_task_daily_request_count_check" CHECK ((request_count >= 0)),
  CONSTRAINT "public_model_task_daily_workspace_count_check" CHECK ((workspace_count >= 0))
);

ALTER TABLE "public"."public_model_task_daily"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX public_model_task_daily_model_date_idx ON public.public_model_task_daily USING btree (model_slug, usage_date DESC);

CREATE POLICY "public_model_task_daily_cohort_read" ON "public"."public_model_task_daily"
  FOR SELECT
  TO "anon", "authenticated"
  USING (((workspace_count >= 5) AND (request_count >= 100)));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."public_model_task_daily" TO "service_role";

REVOKE ALL ON TABLE "public"."public_model_task_daily" FROM "anon";

GRANT SELECT ON TABLE "public"."public_model_task_daily" TO "anon";

REVOKE ALL ON TABLE "public"."public_model_task_daily" FROM "authenticated";

GRANT SELECT ON TABLE "public"."public_model_task_daily" TO "authenticated";

create policy public_task_model_visibility on public.public_model_task_daily as restrictive
for select to anon, authenticated
using (public.public_reporting_route_is_visible(model_slug, null, provider_slug));
