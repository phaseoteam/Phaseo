# Routing-hint write reduction

This pass changes only advisory sticky-routing persistence. It does not change
authorization, revocation, credit freshness, charging, provider rate limits,
health observations, or request/audit logging. No new services or cron jobs.

## Behavior

Each Worker isolate remembers up to 1,000 acknowledged hint writes. Repeated
completions for the same workspace, endpoint, model, context and provider reuse
that acknowledgement for 60 seconds. The local hint still updates immediately.
Changes to provider, hint source, or eligibility for cache affinity write through.
Per-key background writes are ordered; concurrent identical completions coalesce.
Failed writes remove the acknowledgement so subsequent calls retry, including
when an ambiguous write might have reached KV. No extra KV reads are introduced.

Context hints retain a 900-second KV TTL and session hints an 86,400-second TTL
from the last persisted refresh. Because not every completion refreshes KV,
remote hint expiry may precede the latest local activity by up to 60 seconds.
Hints remain best-effort and eventually consistent across isolates. This does
not guarantee session pinning across regions; health and policy filters still win.
Slow cache reads cannot overwrite a newer local completion's hint.

## Deterministic operation counts

The regression suite uses mocked storage, fake time, and the real hint-writing
code. It makes no provider, database, or Cloudflare requests.

| Workload in one isolate | Previous KV writes | New KV writes |
| --- | ---: | ---: |
| 100 eligible same-key/provider completions over 10 seconds | 100 | 1 |
| 100 concurrent identical completions | 100 | 1 |
| 100 distinct keys | 100 | 100 |
| 100 same-key completions spaced one minute apart | 100 | 100 |
| Provider A, then B, then A within one minute | 3 | 3 |

These are hint-write counts, not total request costs or production savings.
The reduction depends on key reuse, provider stability, isolate churn and
traffic distribution. Cache reads, billing, health, analytics, CPU and network
costs are not measured by this fixture. No live latency improvement is claimed:
hint persistence is already background work.

Run with:

```sh
pnpm --filter @phaseo/gateway-api exec vitest run src/pipeline/execute/sticky-routing.writes.test.ts src/pipeline/execute/sticky-routing.optimistic.test.ts src/pipeline/execute/routing.test.ts
```

Next measurement should exercise the whole free and paid completion paths with
mock providers and count all storage operations. Only then use a bounded live
comparison for direct-versus-gateway latency and platform-billed CPU/duration.
