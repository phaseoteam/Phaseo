# Cloudflare end-to-end gateway performance testing

This harness measures the deployed gateway through Cloudflare without sending paid model requests. It consists of a dedicated gateway Worker, a dedicated stateless synthetic upstream Worker, production Supabase reads through an allowlisted performance workspace, isolated operational bindings, and a streaming load client.

## What it measures

The client records response-header time, first complete SSE frame, stream completion, throughput, status distribution, and every metric exposed in `Server-Timing`. Axiom remains the source of truth for `time_to_upstream_request_ms`, provider latency, generation time, routing attempts, and fallback outcomes.

The synthetic upstream is deliberately reached over its public HTTPS URL. That includes the same Worker egress, DNS, TLS, HTTP, and response streaming path as a real upstream provider. A service binding would be useful as a control measurement, but it would remove the outbound network path that dispatch testing is intended to measure.

## Isolation and cost model

- No Durable Object is used. Scenarios are stateless, and the `flaky-25` result is selected deterministically from the request ID.
- The upstream accepts no inference request unless its bearer token matches the `PERF_UPSTREAM_TOKEN` secret.
- Delay and frame controls are capped. The Worker cannot be turned into an unbounded sleep or response generator.
- The perf gateway uses the existing `Performance Testing` workspace and API key in production Supabase. Every request is forced into internally-authorized testing mode.
- Testing-mode requests calculate pricing for observability but never charge credits or persist into production gateway usage tables.
- The deployed perf gateway is restricted to synchronous text-generation endpoints; async video and batch reservation paths are rejected.
- The perf gateway uses a separate Worker name, KV namespace, R2 bucket, and synthetic provider credentials.
- Discovery, reconciliation, email, pricing monitor, and invoicing jobs are disabled in the perf config.
- Production Supabase is intentionally used so authentication, context, pricing, and provider-candidate reads follow the real path. The workspace allowlist and internal test token fail closed before context execution.
- Never use production KV. Synthetic failures must not contaminate production breaker, health, or context-cache state.

## Deploy the synthetic upstream

From `apps/perf-upstream`:

```powershell
$token = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$token | pnpm exec wrangler secret put PERF_UPSTREAM_TOKEN
pnpm run deploy
```

Keep the token for the perf gateway provider secrets. The deployed Worker exposes `/health` publicly and requires the token for all inference routes.

## Prepare the gateway preview

1. Copy `apps/api/wrangler.perf.example.jsonc` to `apps/api/wrangler.perf.jsonc`.
2. The committed template already references the dedicated `GATEWAY_CACHE_PERF` KV namespace, perf R2 bucket, production Supabase URL, and allowlisted `Performance Testing` workspace.
3. Set `SUPABASE_SERVICE_ROLE_KEY`, `GATEWAY_INTERNAL_TEST_TOKEN`, `KEY_PEPPER_ACTIVE`, Axiom credentials, and each enabled provider key as secrets on `phaseo-gateway-perf`. Use the same random token as the synthetic upstream for provider keys.
4. The provider base URLs point at the deployed `phaseo-perf-upstream` Worker. Change their scenario suffixes to construct a test cohort.

Example secrets:

```powershell
$token | pnpm exec wrangler secret put OPENAI_API_KEY --config wrangler.perf.jsonc
$token | pnpm exec wrangler secret put GROQ_API_KEY --config wrangler.perf.jsonc
$token | pnpm exec wrangler secret put DEEPINFRA_API_KEY --config wrangler.perf.jsonc
$token | pnpm exec wrangler secret put TOGETHER_API_KEY --config wrangler.perf.jsonc
pnpm exec wrangler secret put SUPABASE_SERVICE_ROLE_KEY --config wrangler.perf.jsonc
pnpm exec wrangler secret put GATEWAY_INTERNAL_TEST_TOKEN --config wrangler.perf.jsonc
pnpm exec wrangler secret put KEY_PEPPER_ACTIVE --config wrangler.perf.jsonc
```

Use a version upload first. It creates an addressable preview version without changing production traffic:

```powershell
pnpm exec wrangler versions upload --config wrangler.perf.jsonc
```

For a stable load-test URL, deploy the separate `phaseo-gateway-perf` Worker after the preview smoke test:

```powershell
pnpm exec wrangler deploy --config wrangler.perf.jsonc
```

## Synthetic scenarios

Provider base URLs select behavior while the normal provider adapter still appends its `/v1/...` path.

| Base URL suffix | Result |
| --- | --- |
| `/scenarios/fast` | Immediate streamed success |
| `/scenarios/realistic` | 25 ms first-frame delay, then eight frames |
| `/scenarios/slow-first-frame` | 250 ms first-frame delay |
| `/scenarios/rate-limit` | HTTP 429 with `Retry-After` |
| `/scenarios/unavailable` | HTTP 503 |
| `/scenarios/truncated` | Stream closes without a terminal event |
| `/scenarios/flaky-25` | Deterministic 25% HTTP 503 rate |

In `NODE_ENV=test`, an `X-Test-Id` beginning with `perf:` can override bounded controls, for example `perf:first=50;interval=5;frames=10`. Path scenarios are preferable for fallback tests because each provider can have different behavior within one gateway request.

## Run the load test

From `apps/perf-upstream`:

```powershell
$env:GATEWAY_URL = "https://<preview>/v1/chat/completions"
$env:GATEWAY_API_KEY = "<perf-workspace-key>"
$env:GATEWAY_MODEL = "<seeded-multi-provider-model>"
$env:GATEWAY_INTERNAL_TEST_TOKEN = "<internal-test-token>"
pnpm benchmark -- --requests 1000 --concurrency 25 --warmup 100
```

Run at least these cohorts independently so breaker state is interpretable:

1. One fast provider, to establish gateway dispatch overhead.
2. Cheapest provider returns 429, next provider succeeds.
3. Cheapest provider returns 503, next provider succeeds.
4. Repeated 503s until the breaker opens, followed by a recovery run with that provider set to `fast`.
5. A stable provider plus `flaky-25`, to verify exploration and health learning.
6. 50-provider and 100-provider routing remain CPU microbenchmarks unless the perf database deliberately contains that many real candidate mappings.

Compare Axiom percentiles by deployment version and scenario. The primary acceptance gate is p95 `time_to_upstream_request_ms`; keep client first-frame and completion measurements as corroborating end-to-end figures rather than substituting them for the server-side dispatch metric.

The first deployed baseline and its database safety verification are recorded in `cloudflare-perf-baseline-2026-07-22.md`.
