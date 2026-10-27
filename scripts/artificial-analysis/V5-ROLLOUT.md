# Intelligence Index v5 rollout

Preparation as of 27 October 2026. The official methodology page still described
v4.3.2 when checked; these tests use synthetic v5 data, not released v5 results.
The read-only full frontend extraction returned 715 configurations and only
methodology `4.3.2`. No production data was changed for this preparation.

Sources: [methodology](https://artificialanalysis.ai/methodology/intelligence-benchmarking),
[API documentation](https://artificialanalysis.ai/data-api/docs).

## Existing support

The AA page's v4 archive is pinned to the immutable core publication
`f2fbb596-387c-4a2c-92f4-1b59dd723683` (27 October 2026, 07:57:42 UTC)
and rich publication `b72700f9-a724-4089-9794-c698f9a4efd9` (07:58:04 UTC),
both methodology **4.3.2**. These references live in the web API archive module.
Do not delete those database rows or retarget the references during later syncs.
Missing archived data fails closed rather than substituting a newer publication.
Current catalogue visibility rules still apply to archived results.

The single AA page defaults to the highest atomically published scored major,
so validated v5 core publication promotes v5 without hiding v4. The visible
version navigation links explicitly to `?version=4`; that link remains pinned
even before v5 is available. Rich data is fetched for the selected major and
only displayed alongside core results with matching full methodology.

- The API importer accepts major versions 4 and 5. It generates the four
  `aa-*-v5` benchmark IDs and their metadata at publication; do not pre-seed
  scores or reuse v4 IDs. Existing v4 results remain separate.
- API pages must all have the same version. The documentation's full methodology
  version must match the API major/minor before any write.
- The rich snapshot stores its own methodology version and retains raw fields.
  New evaluation slugs are preserved in the evaluation list. New standalone
  fields require explicit extractor and display mappings before they appear.
- Both importers run independently in the scheduled AA workflow. They do not
  form one cross-job transaction: inspect both publications during the switch.

## Launch checks

1. Read the released methodology and API docs. Record the actual version, index
   fields, evaluation membership, score scales, cost/token definitions and source
   date. Do not assume coding, agentic or capability indices changed with the
   Intelligence Index.
2. Run a read-only API preflight:
   `pnpm data:sync-artificial-analysis --report=.tmp/aa-v5-api-report.json`.
   Run a fresh rich-data preflight with a new output filename:
   `pnpm exec tsx scripts/scrape-artificial-analysis-public.ts --match-db --output .tmp/aa-v5-public.json`.
   Use existing maintenance credentials; keep matching payloads private.
3. Compare model/configuration coverage, missing values and source UUID ownership
   with the previous snapshot. Inspect raw fields for additions or renamed
   metrics. Add reviewed mappings and fixtures using the published definitions.
   Preserve null, zero, negative scores and distinct configurations.
4. Check both workflow jobs and their actual published versions. Independent
   jobs can temporarily serve different majors. Validate the single AA search
   entry, canonical page, model pages and rankings all select v5 consistently.
   Never join v4 costs or token usage to v5 scores.
5. Read back the production public API snapshot ID, methodology and several
   configurations against AA, including a model with multiple efforts and one
   missing a metric. Confirm new evaluations are displayed with correct labels
   and units; inspect desktop/mobile after any display change.

## If the rollout changes the contract

Keep validation strict. An API/documentation mismatch or missing version should
fail publication and retain the last valid data. Do not bypass version checks,
guess a version, copy v4 scores to v5, or normalize unknown benchmark scales.
The current parsers require a dotted methodology such as `5.0`; a bare `v5`
heading needs a reviewed parsing change once its authoritative meaning is known.

Review new fields in `public-page.ts`, `artificialAnalysisDashboard.ts`, dashboard
sections/matrices, and the public API types. Raw storage alone does not make a
new evaluation visible. Verify the actual release before claiming v5 readiness.
