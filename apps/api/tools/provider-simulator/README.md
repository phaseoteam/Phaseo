# Provider simulator

A harness that pushes client requests through the gateway's real code path for every
registered text provider, captures the exact upstream HTTP request, and feeds synthesised provider
responses back through the real response, usage and pricing path. It shows where fields are
dropped, renamed, mistranslated or invented, and where usage is lost or billed wrongly.

Nothing here calls a model provider or the Phaseo API. Two parts use the network:
`scripts/refresh-specs.ts`, which downloads public API spec documents, and `src/catalogue.ts`,
which reads routes, capability params and price cards from the catalogue database (SELECTs only).

## Catalogue database

The simulator prices and routes with the rows production uses: `v2_model_provider_routes`,
`v2_route_capabilities`, `v2_pricing_skus` and `v2_pricing_sku_meters`. Every `*.sim.ts` run
and `simulate:providers:expectations` load them once per process (`loadCatalogue()`) and fail with
a clear message when credentials are missing. Set, in the environment, `apps/api/.dev.vars`,
`apps/api/.env.local` or `apps/web/.env.local`:

- `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`), and
- `SUPABASE_SERVICE_ROLE_KEY`. Without it the public `NEXT_PUBLIC_SUPABASE_ANON_KEY` is used, and
  row-level security then hides internal and stealth routes and SKUs not in effect now.

Price cards are shaped by the gateway's own code (`buildPriceCardFromSkuRows` in
`pipeline/pricing/sku-card.ts`, which `loadPriceCard` uses), and the pricing sweep shapes them like the request-context RPC
(`pricing/catalogue-cards.ts`). Expectations name a price by its database identity: the route
ids and SKU codes of the card, and rule ids `<sku_code>@v<version>#<meter_key>`.

The simulator's unit tests (`simulate:providers:test`, run in CI) need no credentials: they serve
a small route and price-card fixture (`__tests__/catalogue-fixture.ts`).

## Run it

```sh
# Every registered text provider, then the expected-outcome gate (about 45 minutes, one process;
# the only network access is the catalogue read).
# Exits non-zero when a mismatch is not on expectations/allowlist.json; SIM_NO_GATE=1 only writes the reports.
pnpm --filter @phaseo/gateway-api simulate:providers

# A subset
SIM_PROVIDERS=anthropic,openai,groq pnpm --filter @phaseo/gateway-api simulate:providers

# Write somewhere other than results/
SIM_RESULTS_DIR=/tmp/sim pnpm --filter @phaseo/gateway-api simulate:providers

# The simulator's own tests (no credentials needed)
pnpm --filter @phaseo/gateway-api simulate:providers:test

# Refresh the cached provider specs (network: GETs of public spec documents only), then regenerate
# the per-provider expectation facts from them (provider ids come from the catalogue database)
pnpm --filter @phaseo/gateway-api simulate:providers:refresh-specs [provider-id ...]
pnpm --filter @phaseo/gateway-api simulate:providers:expectations

# Rebuild summary.json, MATRIX.md, COVERAGE.md and the gate from an earlier run's results
SIM_REPORT_ONLY=1 pnpm --filter @phaseo/gateway-api simulate:providers

# Trace one provider, surface and mode stage by stage (upstream body, client frames, usage, pricing)
SIM_DEBUG=groq:chat:stream SIM_DEBUG_OUT=/tmp/trace.txt \
  pnpm --filter @phaseo/gateway-api exec vitest run --config tools/provider-simulator/vitest.config.ts tools/provider-simulator/debug.sim.ts
# Optional: SIM_ROUTE=<sampled route index>, SIM_SCENARIO=<scenario id>, and a variant such as
# SIM_DEBUG=anthropic:messages:buffered:finish:length
```

`results/providers/` is git-ignored (about 30 MB); `results/summary.json` and `results/MATRIX.md`
are committed. A full run is deterministic, so the per-provider files can always be regenerated.

Outputs:

- `results/providers/<provider>.json`: everything for one provider: per scenario outcome, upstream
  URL and dialect, sentinel fates, parameter effects, schema issues, base upstream bodies (headers
  redacted), prefix stability, non-determinism, every response variant per surface and mode, and the
  all-routes pricing sweep.
- `results/summary.json`: per-provider roll-up, counts and verdict.
- `results/MATRIX.md`: the Markdown matrix.

## Expected outcomes and the gate

The simulator asserts what should happen, not only what does. Expectations are data under
`expectations/` (see `expectations/README.md`), and every one cites its source: a provider spec path,
a provider docs URL, a Phaseo docs page, or `assumed` with the reason.

- `params.json`: where each documented client parameter must land in each upstream dialect, with value
  translations. Whether a provider should receive it is decided from that provider's own spec: a path the
  spec does not define, or a value outside its enum, must not be sent.
- `gateway.json`: client-surface semantics: finish reasons, usage fields per surface, stream grammar,
  mid-stream failure, affinity, and the billing fallback rates.
- `providers/<id>.json`: upstream URL and auth header per dialect, generated from `specs/` and
  `specs/research.json` by `scripts/build-expectations.ts`; hand edits go in `overrides`.
- `e2e/` and `pricing/`: the end-to-end and pricing-sweep layers (below).

`src/expect/` compares observations with expectations and records each difference as a `Mismatch`:
dropped, invented, renamed, wrong value, wrong type, billing over or under (with the delta in tokens and
nanos), stream order, error mapping or nondeterminism. `src/expect/gate.ts` applies
`expectations/allowlist.json` (each entry names its AUDIT finding, the proposed fix group and a
justification) and writes `results/EXPECTATIONS.md` (failing and allowed groups) and
`results/COVERAGE.md` (what share of executors, routes, documented parameters and price meters were
exercised, and what was not, with reasons). `results/baselines/` keeps earlier gate summaries for
before-and-after comparisons.

Checks per route: upstream URL, method and auth header; invented fields in the base request; every
parameter scenario; every value sent in content, tool and agent scenarios (3, 10 and 40 step
histories); determinism and cache-prefix stability; BYOK key use; the affinity pin; and, for every
response variant on every surface and mode, surfaced text, tool ids and arguments, reasoning text and
state, citations, refusals, finish reason, per-field usage, billing per meter, stream grammar and
mid-stream failure. A tool-loop round trip sends each buffered client response back as the next step
and checks that tool calls, ids and reasoning signatures reach the same provider.

## How it works

**Request direction** (`src/request-pipeline.ts`). For each provider, up to three catalogue routes
are sampled (one per model family: Claude, Gemini, OpenAI, other). For each client scenario it runs,
in order, the same functions production runs:

1. the zod request schema (`core/schemas.ts` via `schemaFor`), as `pipeline/before` does;
2. `validateCapabilities` with the route as the only candidate (unknown parameters, parameter
   support and routing preference from the route's catalogue `params`);
3. `prepareServerToolsForTextRequest`, `decodeProtocol`, `validateTextIRContract`, and the forced
   upstream streaming of `pipeline/surfaces/text-generate.ts`;
4. `normalizeIRForProvider` and the catalogue service tier, as `pipeline/execute` does;
5. the registered executor, with `globalThis.fetch` replaced by a capture (`src/fetch-capture.ts`).

Skipped, because they need a database or a live workspace: presets, guardrails, the auto-router,
candidate ranking, sticky-routing reads, BYOK and rate limits.

**Scenarios** (`src/client-requests.ts`). The documented top-level parameters of
`ChatCompletionsRequest`, `ResponsesRequest` and `AnthropicMessagesRequest` are read from
`apps/docs/openapi/v1/openapi.yaml`. Each gets a variant on top of a base request, with a curated
value or one derived from the schema, plus one variant per value of small enums. Curated scenarios
cover every content part type, tool shape and `tool_choice`, `response_format`, reasoning options,
cache controls, `provider_options`, streaming flags, and three-step agent conversations with
parallel tool calls, tool results and reasoning. Every value is a sentinel (`SIM-…`, or a number no
default would produce), so `src/trace.ts` can find where it went: forwarded, renamed, stringified,
changed or dropped. A parameter variant whose upstream body is identical to the base request's had
no effect.

**Specs** (`specs/`). `specs/sources.json` lists public spec URLs; `scripts/refresh-specs.ts` keeps
only the text operations and the schemas they reference, and records the URL, fetch time and
SHA-256. Providers without a machine-readable spec have a hand-written top-level schema in
`specs/hand-written/` (marked `handWritten: true`, with the API reference URL); OpenAI-compatible
providers with neither fall back to the OpenAI schema, labelled `baseline`. `src/schema.ts`
validates captured bodies: undeclared fields, type and enum mismatches, missing required fields.

**Response direction** (`src/dialects.ts`, `src/response-variants.ts`, `src/response-pipeline.ts`).
The captured URL identifies the upstream dialect (OpenAI Chat, OpenAI Responses, Anthropic
Messages, Gemini, Gemini Interactions). For each surface (`/v1/chat/completions`, `/v1/responses`,
`/v1/messages`) and each client mode (streaming, buffered) the executor receives synthesised native
responses: plain text; a "max" response with reasoning and signatures, two parallel tool calls,
citations, logprobs and every usage field the provider documents (taken from its spec's usage schema
or its API reference); four finish reasons and a refusal; and HTTP and mid-stream errors. Streaming
clients go through `passthroughWithPricing` with a copy of production's frame rewriter
(`pipeline/after/stream.ts:247-349`) and its finalisation rules; buffered clients go through
`consumeTextProtocolStreamToIR`, `encodeProtocol`, `enrichSuccessPayload` and the non-stream
pricing of `pipeline/after/index.ts:437-486`. Pricing uses the route's real price card from
the catalogue database and a synthetic card with every meter, so meters that
usage normalisation never produced are visible even where the catalogue has no row.

Usage values are distinct sentinels (input 100,003; cached 20,011; cache write 3,019 = 1,013 + 2,006;
output 5,003; reasoning 1,109; …), so each provider field can be traced into a meter. Expected
billable totals follow each dialect's documented semantics (OpenAI-style input includes cached
reads and writes; Anthropic input excludes both; Gemini thinking tokens are output).

## Add a provider

1. Register its executor in `src/executors/index.ts` as usual; the simulator picks up every
   registered `text.generate` executor and its catalogue routes automatically.
2. If it publishes an OpenAPI spec or Google discovery document, add an entry to
   `specs/sources.json` (`id` = gateway provider id, `url`, `format`, and the paths of its text
   operations), run the refresh script, and add `{ "spec": "<id>", "kind": "own" }` to
   `specs/manifest.json`.
3. Otherwise write `specs/hand-written/<id>.json` from its API reference (top-level request
   properties, `additionalProperties: false`, `source.handWritten: true`, `source.docs` = the page),
   and list documented usage fields under `usageFields` in the manifest.
4. If its upstream wire format is new, add a dialect to `src/dialects.ts` (detection from the URL,
   plus JSON, SSE and error writers).

## Limits

- Catalogue rows are read from the database at run time, so results follow catalogue edits; runs on
  different days can differ for that reason alone. The sweep clock (`SIM_PRICING_NOW`, default the
  start of the run) is recorded in each expectations file.
- Hand-written schemas check top-level keys only.
- Synthesised responses follow each spec's schemas and documented usage fields, but a provider's
  real behaviour can differ from its documentation. Findings that depend on that are marked
  needs-live in `AUDIT.md`.
- Upstream error mapping goes through `guardAllFailed` with an attempt error built the way
  `pipeline/execute/index.ts:1215-1300` builds it; the attempt loop itself is not run.
