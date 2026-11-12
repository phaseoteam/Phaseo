CREATE TABLE "public"."v2_benchmarks" (
  "benchmark_id"    text                     NOT NULL,
  "name"            text                     NOT NULL,
  "category"        text,
  "link"            text,
  "total_models"    integer,
  "ascending_order" boolean                  NOT NULL DEFAULT false,
  "benchmark_type"  text,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_benchmarks_pkey" PRIMARY KEY (benchmark_id)
);

ALTER TABLE "public"."v2_benchmarks"
  ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER catalogue_no_removal
  BEFORE DELETE OR TRUNCATE ON public.v2_benchmarks
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.prevent_catalogue_removal();

CREATE TRIGGER catalogue_row_history
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_benchmarks
  FOR EACH ROW
  EXECUTE FUNCTION catalogue_private.record_row_history();

CREATE TRIGGER routing_catalogue_changed
  AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.v2_benchmarks
  FOR EACH STATEMENT
  EXECUTE FUNCTION private.invalidate_routing_catalogue();

CREATE POLICY "v2_benchmarks_public_select" ON "public"."v2_benchmarks"
  FOR SELECT
  TO "anon", "authenticated"
  USING (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_benchmarks" TO "anon", "authenticated", "service_role";
