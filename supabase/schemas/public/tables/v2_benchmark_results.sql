CREATE TABLE "public"."v2_benchmark_results" (
  "result_id"        uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "model_slug"       text                     NOT NULL,
  "benchmark_id"     text                     NOT NULL,
  "score"            text,
  "score_numeric"    numeric,
  "is_self_reported" boolean                  NOT NULL DEFAULT false,
  "other_info"       text,
  "source_link"      text,
  "rank"             integer,
  "occur_idx"        integer,
  "variant"          text,
  "result_key"       text,
  "created_at"       timestamp with time zone,
  "updated_at"       timestamp with time zone,
  "effective_to"     timestamp with time zone,
  CONSTRAINT "v2_benchmark_results_pkey" PRIMARY KEY (result_id),
  CONSTRAINT "v2_benchmark_results_benchmark_id_fkey" FOREIGN KEY (benchmark_id) REFERENCES public.v2_benchmarks(benchmark_id) ON DELETE CASCADE,
  CONSTRAINT "v2_benchmark_results_model_slug_fkey" FOREIGN KEY (model_slug) REFERENCES public.v2_models(model_slug) ON DELETE CASCADE
);

ALTER TABLE "public"."v2_benchmark_results"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX v2_benchmark_results_model_idx ON public.v2_benchmark_results USING btree (model_slug, benchmark_id);

CREATE INDEX v2_benchmark_results_rank_idx ON public.v2_benchmark_results USING btree (benchmark_id, rank, model_slug);

CREATE TRIGGER catalogue_no_removal
  BEFORE DELETE OR TRUNCATE ON public.v2_benchmark_results
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.prevent_catalogue_removal();

CREATE TRIGGER catalogue_row_history
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_benchmark_results
  FOR EACH ROW
  EXECUTE FUNCTION catalogue_private.record_row_history();

CREATE TRIGGER routing_catalogue_changed
  AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.v2_benchmark_results
  FOR EACH STATEMENT
  EXECUTE FUNCTION private.invalidate_routing_catalogue();

CREATE POLICY "provider_catalog_public_guard" ON "public"."v2_benchmark_results"
  AS RESTRICTIVE
  FOR SELECT
  TO "anon", "authenticated"
  USING (public.catalog_model_is_public(model_slug));

CREATE POLICY "v2_benchmark_results_public_select" ON "public"."v2_benchmark_results"
  FOR SELECT
  TO "anon", "authenticated"
  USING (((effective_to IS NULL) OR (effective_to > now())));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_benchmark_results" TO "anon", "authenticated", "service_role";
