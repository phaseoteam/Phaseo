-- Disposable replay only: exercise real catalogue constraints and triggers.
BEGIN;
SET LOCAL statement_timeout = '30s';
INSERT INTO public.v2_labs(lab_slug, name) VALUES ('aa-publication-smoke', 'AA publication smoke');
INSERT INTO public.v2_models(model_slug, lab_slug, name)
VALUES ('aa-publication-smoke/model', 'aa-publication-smoke', 'AA publication smoke model');
SET LOCAL ROLE service_role;
DO $test$
DECLARE
  snapshot_uuid uuid := gen_random_uuid();
  result_uuid uuid := gen_random_uuid();
  document jsonb;
BEGIN
  document := jsonb_build_object('snapshot_id', snapshot_uuid, 'major_version', 4,
    'methodology_version', '4.3.2', 'fetched_at', now(),
    'benchmarks', (SELECT jsonb_agg(jsonb_build_object('benchmark_id', prefix || '-v4',
      'name', prefix, 'total_models', 1, 'ascending_order', true))
      FROM unnest(ARRAY['aa-intelligence-index','aa-coding-index','aa-agentic-index','aa-intelligence-index-cost']) prefix),
    'model_slugs', jsonb_build_array('aa-publication-smoke/model'),
    'source_owners', jsonb_build_object('smoke-source', 'aa-publication-smoke/model'),
    'results', jsonb_build_array(jsonb_build_object('result_id', result_uuid,
      'model_slug', 'aa-publication-smoke/model', 'benchmark_id', 'aa-intelligence-index-v4',
      'result_key', 'aa-publication-smoke:4:source', 'score', '50', 'score_numeric', 50,
      'other_info', 'Artificial Analysis ID smoke-source; Intelligence Index v4.3.2')));
  ASSERT public.publish_artificial_analysis_snapshot(document) = snapshot_uuid;
  ASSERT public.publish_artificial_analysis_snapshot(document) = snapshot_uuid;
  ASSERT EXISTS (SELECT 1 FROM public.artificial_analysis_snapshots WHERE snapshot_id = snapshot_uuid);
  ASSERT EXISTS (SELECT 1 FROM public.v2_benchmark_results WHERE result_id = result_uuid AND score_numeric = 50);
  ASSERT EXISTS (SELECT 1 FROM public.get_artificial_analysis_coverage()
    WHERE benchmark_id = 'aa-intelligence-index-v4' AND total_models > 0 AND published);
END;
$test$;
ROLLBACK;
