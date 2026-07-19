-- DuckDB-compatible source queries for the bounded report datasets.
-- The Python audit module materializes these reviewed JSON files first.

SELECT *
FROM read_json_auto('analysis-summary.json');

SELECT provider_id, model_id, capability_id, gap_type
FROM read_json_auto('route-pricing-gaps.json')
WHERE gap_type <> 'alternate_pricing_key_only';

SELECT *
FROM read_json_auto('provider-coverage.json');

SELECT *
FROM read_json_auto('external-source-checks.json');
