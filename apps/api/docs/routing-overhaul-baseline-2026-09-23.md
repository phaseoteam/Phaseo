# PR-based staging baseline

Deployed Worker version: `5cd206e0-579b-4af0-ad65-e08bb8fdc134`.
Source commit: `d4501a00e2f203d5aa8564043f04c06dd74402b3`.
Environment: original staging, shared production database, schedules disabled.
Previous staging version (rollback): `35c65319-f010-4340-bcd4-38ecab37b892`.
Production was not deployed. GitHub-native stack #2525 contains #2465, #2523
and #2524. The cache changes above this baseline are not represented below.

## Local gates

583 source test files / 4,462 tests pass. Typecheck, scoped ESLint, staging dry-run,
and the native Workers operation-attribution test pass. Native attribution uses
12 interleaved requests and a real local KV binding, without external services.

## Bounded free-model probes

Both runs used London ingress, six sequential non-streaming Chat requests, 16
maximum output tokens, verified zero-priced Poolside-only routes, and disposable
15-minute keys revoked afterward. No wallet edits or paid inference.

| Model | Fresh key, one sample | Warm mean, five samples | Warm range | Result |
| --- | ---: | ---: | ---: | --- |
| Poolside Laguna XS 2.1 free | 833 ms | 16 ms | 9–27 ms | All 200, zero cost |
| Poolside Laguna S 2.1 free | 432 ms | 12.8 ms | 5–23 ms | All 200, zero cost |

Metric: gateway receipt to first upstream dispatch, not provider latency or total
response time. The XS first request exceeds the 500 ms target. These are small
regional samples, not a global SLO or fully cold cache experiment.
Revoked key IDs: `7e05eab8-6543-4dd5-a153-cc63a44f4237` (XS) and
`75a40aba-9b55-48ab-8939-7a39fff73680` (S).

## Observed operation baseline (S run)

The first tail did not capture XS events; no operation claim is made for it.
The second tail captured six complete S operation records. Their dispatch times
match the six request-log measurements in order.

| Operations per request | Fresh S | Warm S mean |
| --- | ---: | ---: |
| KV keys read | 13 | 3.6 |
| KV writes from gateway | 9 | 0 |
| Health RPCs | 1 | 1 |
| Supabase read HTTP calls | 11 | 1 |
| Supabase mutation HTTP calls | 3 | 3 |
| Supabase RPC HTTP calls | 3 | 2 |

Warm dispatch activity contained three KV reads in four samples and six in one,
plus one concurrently started Supabase mutation each. Activity before dispatch
does not establish that the mutation blocks dispatch. All recorded background
sets drained. These totals exclude internal DO storage, alarms/duration, platform
CPU, logging, and external storage. They are not a complete serving-cost estimate.

Next gates: bounded L1 adoption, compact public snapshots/Cache API, workspace and
auth leases, then memory-first health. Keep lifecycle correctness tests and
operation/latency comparisons at each deployable increment.
