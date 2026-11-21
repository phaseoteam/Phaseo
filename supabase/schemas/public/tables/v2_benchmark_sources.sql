CREATE TABLE "public"."v2_benchmark_sources" (
  "source_id"          text                     NOT NULL,
  "name"               text                     NOT NULL,
  "publisher"          text,
  "url"                text                     NOT NULL,
  "attribution"        text,
  "enabled"            boolean                  NOT NULL DEFAULT true,
  "last_run_at"        timestamp with time zone,
  "last_success_at"    timestamp with time zone,
  "last_status"        text,
  "last_error"         text,
  "last_row_count"     integer,
  "last_matched_count" integer,
  "unmatched_labels"   jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"         timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_benchmark_sources_pkey" PRIMARY KEY (source_id),
  CONSTRAINT "v2_benchmark_sources_last_status_check" CHECK ((last_status = ANY (ARRAY['ok'::text, 'failed'::text, 'refused'::text, 'empty'::text]))),
  CONSTRAINT "v2_benchmark_sources_source_id_check" CHECK ((source_id ~ '^[a-z0-9][a-z0-9-]*$'::text))
);

ALTER TABLE "public"."v2_benchmark_sources"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "v2_benchmark_sources_public_select" ON "public"."v2_benchmark_sources"
  FOR SELECT
  TO "anon", "authenticated"
  USING (true);

GRANT SELECT ON TABLE "public"."v2_benchmark_sources" TO "anon", "authenticated";

GRANT INSERT, SELECT, UPDATE ON TABLE "public"."v2_benchmark_sources" TO "service_role";
