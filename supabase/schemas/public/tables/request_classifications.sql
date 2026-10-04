CREATE TABLE "public"."request_classifications" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "contribution_id"  uuid                     NOT NULL,
  "workspace_id"     uuid                     NOT NULL,
  "classifier_id"    uuid                     NOT NULL,
  "primary_category" text                     NOT NULL,
  "labels"           jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "confidence"       numeric(5,4),
  "model"            text                     NOT NULL,
  "service_tier"     text                     NOT NULL,
  "latency_ms"       integer,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "request_classifications_confidence_check" CHECK (((confidence IS NULL) OR ((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)))),
  CONSTRAINT "request_classifications_contribution_id_classifier_id_key" UNIQUE (contribution_id, classifier_id),
  CONSTRAINT "request_classifications_contribution_id_fkey" FOREIGN KEY (contribution_id) REFERENCES public.data_contributions(id) ON DELETE CASCADE,
  CONSTRAINT "request_classifications_labels_array_check" CHECK ((jsonb_typeof(labels) = 'array'::text)),
  CONSTRAINT "request_classifications_latency_ms_check" CHECK (((latency_ms IS NULL) OR (latency_ms >= 0))),
  CONSTRAINT "request_classifications_pkey" PRIMARY KEY (id),
  CONSTRAINT "request_classifications_classifier_id_fkey" FOREIGN KEY (classifier_id) REFERENCES public.workspace_classifiers(id) ON DELETE CASCADE,
  CONSTRAINT "request_classifications_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."request_classifications"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX request_classifications_classifier_category_idx ON public.request_classifications USING btree (classifier_id, primary_category, created_at DESC);

CREATE INDEX request_classifications_workspace_created_idx ON public.request_classifications USING btree (workspace_id, created_at DESC);

CREATE POLICY "service_role_full_access" ON "public"."request_classifications"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."request_classifications" TO "service_role";

REVOKE ALL ON TABLE "public"."request_classifications" FROM "anon", "authenticated";
