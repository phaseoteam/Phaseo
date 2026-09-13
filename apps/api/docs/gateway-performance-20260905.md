# Gateway performance measurements — 5 September 2026

Implemented in `perf/gateway-critical-path-20260905`, based on main revision
`0d58d7dc0`. Worktree: `E:/phaseo-worktrees/gateway-performance-20260905`.
No deployments or database migrations were applied.

## Results

Measurements used Windows, Node 24.15.0, local Wrangler on port 8795, and the
configured remote Supabase database. Inference requests were pinned to Poolside
with provider fallback disabled, using `poolside/laguna-s-2.1:free` and
`poolside/laguna-xs-2.1:free`. The joined database query confirmed zero input and
output prices for the tested free SKU.

| Measurement | Before, median | After, median | Interpretation |
| --- | ---: | ---: | --- |
| Uncached price-card load | 93.64 ms | 52.45 ms | About 44% faster; four HTTP requests become one |
| Synthetic BYOK hydration, 12 keys | 0.90 ms | 0.75 ms | Small CPU improvement; 12 master-key imports become one |
| Warm gateway overhead, sequential | 37 ms | 40 ms | No demonstrated improvement |
| Warm gateway overhead, concurrency 3 | 77 ms | 62 ms | Observed reduction; small samples and network variation limit attribution |
| Warm first content, sequential | 638 ms | 957 ms | Provider variation dominates; no end-to-end speedup established |
| Warm first content, concurrency 3 | 1,191 ms | 736 ms | Observed values, not an isolated estimate of code impact |

Price-card measurements alternated baseline and changed loaders, resetting their
local caches before every sample: eight samples per variant per free model,
16 per variant overall. Complete serialized cards matched exactly. This measures
the fallback price loader, not every inference request: context often already
contains pricing. Exact provider-slug lookups previously used three HTTP requests;
canonical/model-slug alternatives used four. Both now use one.

BYOK measurements used synthetic ciphertext, real Web Crypto, 50 alternating
samples per variant, and 12 decryptions per hydration. This isolates key-import
work; it does not measure a production BYOK database lookup or promise a similar
percentage reduction in full request latency.

Each S-model end-to-end group contains 12 measured requests, with warmups excluded.
The prompt was “Reply with exactly OK”, with an eight-token output cap. The final
XS check contains three measured requests at a 128-token cap, all HTTP 200 with
content and stream completion; median first content was 689 ms. Its earlier
eight-token runs returned no content and are excluded from successful content
latency comparisons. Their HTTP 200/header timings alone were misleading.

Raw aggregate results are in [gateway-performance-20260905.json](./gateway-performance-20260905.json).
Local experiment scripts, detailed samples, and logs remain in the worktree's
ignored `.performance/` directory. Small local samples do not establish production
p95/p99 latency or a global edge-cache benefit. Local KV does not reproduce remote
KV write latency. Axiom's configured dataset returned background ingestion 404s
during local testing; inference completed, but those runs lack that telemetry sink.

## Changes retained

- Fetch SKUs, their route, and billable meters with one PostgREST join using
  existing foreign keys. Preserve route filtering, pricing windows, meter ordering,
  metadata, and positive/missing-price cache TTLs. Query errors fail closed without
  being cached as absent pricing.
- Populate authentication L1 immediately and send the versioned KV write to the
  existing background dispatcher. A regression test holds that write pending and
  verifies both initial authentication and an immediate L1 hit complete.
- Share in-flight provider limit configuration loads. The concurrency test verifies
  20 cold requests make one config query and still make 20 independent admission
  calls. A failed shared read is retried by the next request.
- Reuse imported BYOK master keys within one hydration. Keep fresh key eligibility
  checks and per-credential decryption. No cross-request credential cache was added.
- Include preset access, private-model lookup, and BYOK hydration in context timing.
  Add `context_preset_access`, `context_private_model`, and
  `context_byok_hydration` Server-Timing spans. Previously, context totals omitted
  private-model checks and BYOK hydration. The final warm S-model median private
  model lookup was 37 ms, accounting for most measured gateway overhead.
- Improve the benchmark with bounded SSE parsing, first-content timing, concurrent
  groups, timeout/cancellation, terminal-frame validation, configurable token cap,
  provider pinning, and individual samples. Error or content-free streams fail the
  benchmark instead of being counted as successful content delivery.

## Changes not retained

Overlapping workspace settings/billing reads with the context RPC produced no
meaningful improvement. A larger alternating comparison gave medians of 176.58 ms
before and 177.67 ms after (24 samples per variant). Context payloads matched after
excluding telemetry and three naturally changing clock fields: `keyLimit.now`,
`teamEnrichment.account_age_days`, and `keyEnrichment.key_age_days`. The overlap
experiment was reverted. Folding enrichment into the database RPC remains a
separate option requiring database-side work and measurement.

Credit-cache writes remain awaited: finishing them before later billing
invalidation prevents a delayed write from restoring stale credit. Existing
credit-write ordering tests pass. Lazy decryption of candidate credentials was
not introduced; only master-key import reuse was retained, keeping credential
selection and failure timing intact. Private-model checks remain fresh on every
text request; their visibility/invalidation policy was not loosened for speed.

## Verification

- 949 tests across 111 files passed for before/execute/after, pricing, BYOK,
  provider limits, text generation surfaces, and protocol coverage.
- The final pricing error-recovery assertion also passed in its seven-test suite.
- `tsc --noEmit` passed.
- ESLint on changed TypeScript files passed with existing file-length warnings in
  `before/context.ts` and `before/index.ts`.
- `wrangler deploy --dry-run` passed.
- Updated stale tests that referenced missing pricing helpers, an old static cache
  key format, missing private-model lookup mocks, and a missing exact-slug argument.

## Repeat the inference benchmark

From `apps/api`, start a local server:

```powershell
pnpm exec wrangler dev --local --ip 127.0.0.1 --port 8795 --inspector-port 9295 --show-interactive-dev-session=false
```

Provide the existing gateway performance key through an ignored environment file
or `GATEWAY_API_KEY`; never put it in a command argument or tracked file.

```powershell
$env:DOTENV_CONFIG_PATH = '<path-to-existing-test-env-file>'
$env:GATEWAY_URL = 'http://127.0.0.1:8795'
$env:GATEWAY_MODEL = 'poolside/laguna-s-2.1:free'
$env:GATEWAY_PROVIDER = 'poolside'
$env:BENCHMARK_WARMUPS = '2'
$env:BENCHMARK_REQUESTS = '12'
$env:BENCHMARK_CONCURRENCY = '1'
$env:BENCHMARK_MAX_TOKENS = '8'
pnpm exec tsx scripts/benchmark-real-gateway.ts
```

Repeat with concurrency `3`. For the XS free model, use a 128-token cap. Compare
gateway timing spans separately from provider headers and first content.

Implementation references: [Supabase joins](https://supabase.com/docs/guides/database/joins-and-nesting)
and [Cloudflare background work](https://developers.cloudflare.com/workers/runtime-apis/context/).

## OpenAI GPT-5.6 Luna follow-up

Repeated the comparison using `openai/gpt-5.6-luna`, pinned to `openai` with
fallback disabled. Restored the complete baseline `apps/api` source from
`0d58d7dc0` into the ignored `.performance/old/` directory, with a separate local
Wrangler server on port 8796. The optimized gateway ran on port 8795. Both used
the same local configuration, database, test key, and upstream provider.

| Measurement | Baseline median | Optimized median | Samples per version |
| --- | ---: | ---: | ---: |
| Uncached Luna price-card load | 137.39 ms | 73.69 ms | 16 |
| Warm gateway overhead | 102 ms | 88 ms | 8 |
| First content | 924 ms | 681 ms | 8 |
| Upstream response headers | 668 ms | 533 ms | 8 |

The isolated pricing improvement reproduced: approximately **46% faster**, with
four database requests reduced to one. Pricing samples alternated old/new order
and reset local loader caches before each call. Timing stopped immediately after
the loader returned, before parity checks.

Luna has multiple pricing tiers with equal `meter_order` values. The two queries
returned these tied rules in different sequences, so raw JSON ordering did not
match. All card fields and rules matched after sorting rules by ID. Calculated
bill totals and selected rule IDs also matched across 24 combinations: standard,
priority, flex, and batch plans, each at input counts 1, 1,000, 271,999, 272,000,
272,001, and 1,000,000, with output/cache usage included. This verifies the tested
tariff cases; it is not a claim that arbitrary equal-priority conflicting rules
are order-independent.

Live tests used the same short prompt and a 128-token output cap. One smoke request
per gateway was excluded, followed by eight paired rounds, alternating which
version ran first. All 18 requests returned HTTP 200, content, and a terminal
stream frame. These are warm pricing-context requests; timing spans show credit
refreshes, not uncached price-card loads. The end-to-end improvement is therefore
an observation, not attributable solely to the pricing change. Upstream variation
and the small sample size prevent a firm end-to-end performance claim.

No runtime code changes were needed for this follow-up. The aggregate JSON includes
these results under `openaiVerification`; detailed samples and comparison scripts
remain in `.performance/`.

## Private-model index follow-up

Added a bounded, isolate-local index containing enabled private-model IDs only,
scoped by workspace, API key, and the existing key cache version. It expires five
seconds after the database read starts. Concurrent requests share an index load.
An absent model skips the credential lookup; a matching model still reads its
current credentials, enabled state, endpoint, and routing policy on every request.
This supports attachments to ordinary public catalogue IDs. Cache bypass still
performs the original exact lookup. Failed or incomplete index queries fall back
to that lookup instead of treating the workspace as empty.

Create, update (including enable/disable, rename, and credential rotation), and
delete routes now reuse the existing workspace API-key invalidation mechanism.
Mutation responses expose `gatewayCacheInvalidated`; failed propagation does not
misreport an already-saved mutation as failed. Invalidation is not instantaneous
across Workers/KV. The five-second index lifetime independently bounds reuse of
negative metadata, including OAuth sessions and changes made outside these routes.
Newly created or renamed models can therefore require up to five seconds plus
database latency to appear. Existing positive matches always use a fresh lookup.
Both gateway and web-api changes are needed for the mutation invalidation hooks.

Measured on the same optimized local gateway before and after adding the index,
with `poolside/laguna-s-2.1:free`, one request at a time, eight output tokens, and
two excluded warmups per run:

| Measurement | Before (12 requests) | After (12 requests) | Repeat after (24 requests) |
| --- | ---: | ---: | ---: |
| Median total gateway overhead | 44 ms | 5 ms | 4 ms |
| Median private-model lookup | 39 ms | <1 ms | <1 ms |
| p95 total gateway overhead | 149 ms | 307 ms | 91 ms |
| Median first content | 679 ms | 820 ms | 720 ms |

All 48 measured requests returned HTTP 200, content, and a terminal stream frame.
The median gateway-overhead reduction was approximately 89–91%. This is a warm
gateway improvement for the tested account, not a provider generation speedup or
a production latency guarantee. First-content latency did not improve in these
runs. Index refreshes still incur database latency: the first after run had a
301 ms private-index span; the repeat had a 270 ms maximum private-index span.
Small samples and sequential before/after runs do not establish a tail-latency
improvement. The repeat overlapped local regression tests, adding another source
of timing noise.

A separate alternating helper comparison returned identical null results:
16 original exact lookups made 16 database calls, while 16 indexed lookups made
one. Warm index checks were approximately 0.02 ms; eight forced cold index loads
each made one database call and took roughly 40–50 ms typically. Matching private
models incur an additional metadata query when their index is cold; the primary
benefit is requests that do not match private models.

Validation: 958 gateway tests across 112 files; 22 web-api tests covering private
model authentication, mutation invalidation, and existing policy invalidation;
both API TypeScript checks and Worker dry-run builds passed. Changed-file lint
passed with only the existing context-file length warning. Tests cover empty
indexes, concurrent loads, workspace isolation, version changes, expiry,
incomplete/error results, cache bypass, and fresh positive routing/deletion reads.
Raw measurements are included under `privateModelIndexVerification` in the JSON.
No production deployment or private-model data mutation was performed.
