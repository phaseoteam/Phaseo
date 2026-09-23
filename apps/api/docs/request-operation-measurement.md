# Request operation measurement

`GATEWAY_OPERATION_SAMPLE_RATE` accepts 0–1, defaults to disabled, and cannot be
enabled by a client header. Staging samples every request. Production configuration
does not enable sampling. Each sampled `withRuntime` request emits one bounded
`gateway_operations` event with a request ID, counters, and dispatch timing.
No cache keys, credentials, database URLs, prompts or responses are retained.

## What the counters mean

- KV reads count **keys**, not bulk API invocations. Attempts that fail still count.
- Supabase GET/HEAD, mutations and RPCs are separate. A POST RPC can read or write;
  RPCs must be examined before asserting zero control-plane reads.
- Health and provider-quota RPCs count actual calls, including retries.
- Cache API reads/writes are distinct from billed KV operations.
- `beforeDispatch` includes all observed operations started before the first
  tracked provider fetch, including concurrent background tasks. It is a
  conservative activity count, **not** proof that each operation blocked dispatch.
- `total` waits for the existing SSE lifecycle and background tasks registered
  through `dispatchBackground`. Tracking is bounded at 128 concurrent promises
  and 16 drain rounds. Overflow/remaining work produces `complete: false`.

These are gateway-client counters, not a complete Cloudflare invoice. Direct
binding accesses outside these helpers, scheduled jobs, internal DO storage,
DO duration, Worker CPU, logging and external storage still need platform metrics.
Platform termination can prevent the final event; missing events are not zero-cost
requests. Realtime WebSocket duration is not measured by the SSE lifecycle.

## Validation

Run `pnpm exec vitest run src/runtime/request-operations.test.ts
src/routes/utils.operations.test.ts`, typecheck, and
`node scripts/test-request-operations.workerd.mjs` from `apps/api`.
The native test uses local KV and interleaves 12 requests; it makes no provider
calls and has no remote bindings. Workers explicitly enables `nodejs_als` on
the existing compatibility date rather than changing unrelated runtime behavior.

Before cost comparison, join sampled request IDs to the bounded Poolside probe,
record deployed Worker version, exclude incomplete samples, and report both
dispatch and full-lifecycle operation counts. Never present old staging timings
as measurements of the PR-based candidate.
