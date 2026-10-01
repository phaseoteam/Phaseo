# Workers CPU investigation — 2026-10-01

## Production evidence

Read-only Cloudflare GraphQL analytics for the Phaseo account, queried at
2026-09-30 23:04 UTC (2026-10-01 00:04 BST). The rolling 24-hour window
started at 2026-09-29 23:04 UTC. These are analytics aggregates, not invoice
line items. CPU values returned in microseconds were converted to seconds
or milliseconds below.

| Worker / outcome | Invocations | Total CPU seconds | Median CPU ms | p99 CPU ms |
| --- | ---: | ---: | ---: | ---: |
| phaseo-gateway / success | 14,876 | 3,452.00 | 36.98 | 3,724.08 |
| phaseo-gateway / clientDisconnected | 39 | 26.66 | 13.07 | 14,323.50 |
| phaseo-web-api / success | 158,838 | 658.68 | 0.86 | 37.01 |

The gateway accounted for approximately 84% of CPU across the returned
Worker aggregates. It deserves priority over the web API despite receiving
far fewer invocations.

Daily gateway aggregates, queried at 2026-09-30 23:07 UTC:

| UTC date | Invocations | Total CPU seconds | Median CPU ms | p99 CPU ms |
| --- | ---: | ---: | ---: | ---: |
| September 24 | 15,961 | 313.47 | 13.66 | 176.18 |
| September 25 | 14,527 | 336.36 | 14.67 | 348.28 |
| September 26 | 17,822 | 1,088.97 | 15.60 | 709.09 |
| September 27 | 9,371 | 3,660.64 | 158.77 | 2,957.81 |
| September 28 | 14,822 | 3,521.58 | 56.50 | 3,507.89 |
| September 29 | 16,011 | 3,305.02 | 72.49 | 1,285.92 |
| September 30, through 23:07 UTC | 14,830 | 3,472.55 | 37.07 | 3,789.94 |

The increase around September 26–27 is not explained by invocation volume
alone. Average CPU rose from about 23 ms on September 25 to 391 ms on
September 27. Deployment-version aggregates vary substantially, but traffic
mix and scheduled work prevent attributing causality to a deployment from
these aggregates alone.

The current production version was deployed September 30 at 12:36 UTC.
No deployment, configuration change, or production data write was performed.

## Verified code improvement

`src/pipeline/execute/sticky-routing.ts` did unnecessary work when computing
opening context anchors:

- It extracted both message and Responses anchors regardless of endpoint.
- It normalized later messages after the first system/developer and user
  anchors were already fixed.
- It normalized every content part before retaining only the first eight
  meaningful parts.

The change selects the appropriate format, stops after both anchors are
found, skips irrelevant message roles, and stops after eight meaningful
parts. Existing fallback selection, cache hints, hash version, and routing
keys are preserved.

Local Node 24 microbenchmark of anchor construction, with system/user
opening messages followed by messages containing 16 text parts each:

| Fixture | Before ms/call | After ms/call |
| --- | ---: | ---: |
| Chat, 100 messages | 0.4393 | 0.00017 |
| Chat, 1,000 messages | 5.4997 | 0.00015 |
| Responses, 100 messages | 0.2300 | 0.00014 |
| Responses, 1,000 messages | 2.8051 | 0.00029 |

These are local elapsed-time microbenchmarks for one synchronous function,
excluding hashing, streaming, billing, telemetry, and network operations.
They do not establish whole-Worker CPU or billing savings. The production
regression is much larger than these measured savings, so this change is
a first reduction rather than a demonstrated fix for the increase.

## Validation

- All 10 focused sticky-routing Vitest tests passed, including regressions
  checking that ignored content is not visited and fallback selection remains
  correct.
- 4,500 deterministic generated cases compared original and optimized
  context construction and final routing keys across all three supported
  text endpoints; all matched.
- `git diff --check` passed for the changed source, tests, and changeset.
- The repository gateway dependencies are missing. A frozen pnpm install
  failed because the existing API manifest contains `music-metadata` absent
  from the lockfile. Vitest 4.1.7 was installed in a temporary directory and
  run with an isolated config mapping the gateway aliases and the test file.
  The repository manifest and lockfile were not changed.
- Full repository lint/typecheck and Worker dry-run builds remain unverified
  because of that dependency state.

## Remaining attribution

The Workers Observability historical query API returned HTTP 403 with the
current OAuth credentials. GraphQL analytics and a short live tail worked.
The first 30-second live sample contained six completed chat requests using
103 ms CPU in total (maximum 25 ms); it cannot explain historical outliers.

Next, use access with Workers Observability permissions to query invocation
CPU grouped by route and event type, focusing on CPU over 500 ms and the
September 26–27 transition. Check scheduled model discovery/pricing-page
processing separately from long streaming responses and payload telemetry.
These are candidates from code inspection, not identified root causes.
Reproduce the largest class locally with a deterministic fixture and collect
a workerd CPU profile before changing its behavior. Compare production CPU
per invocation and traffic mix after the optimization is deployed through
the normal reviewed PR flow.

References: [Workers analytics](https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-workers-metrics/),
[CPU profiling](https://developers.cloudflare.com/workers/observability/dev-tools/cpu-usage/),
[historical telemetry query API](https://developers.cloudflare.com/api/resources/workers/subresources/observability/subresources/telemetry/methods/query/).

## Scheduled workload follow-up (October 1)

Read-only inspection of the latest deployment, version
`b60afb8b-c733-4d16-9044-19eb2b3cb6a8` from September 30 at 12:36 UTC,
confirmed `MODEL_DISCOVERY_SHARDING_ENABLED=false`, shard size 20,
discovery concurrency 8, and pricing-page monitoring enabled. This checkout's
scheduler always shards and lacks that toggle, so its source must be reconciled
with production before a deployment. Configuration and code hotspots support
investigating scheduled work, but do not establish it caused the CPU tail.

A 180-second live tail sample observed chat entries totaling 2,070 ms CPU
(maximum 257 ms) and scheduled entries totaling 459 ms (maximum 428 ms).
Tail entries can include multiple records per invocation; these are sample
observations, not request-volume estimates or historical attribution.

Supplemental pricing arrays now compute each JSON sort key once. Existing
ordering, volatile-field exclusion, and non-token pricing alerts are preserved.
Two regression tests passed alongside the ten sticky-routing tests. A separate
150-case comparison matched the original outputs. A local 100-entry benchmark
measured 0.3745 ms before and 0.1640 ms after (about 56% lower elapsed time for
this function); this is not a whole-Worker CPU estimate.

`src/jobs.ts` and `wrangler.jobs.toml` prepare a scheduled-only Worker with its
cron disabled. A Wrangler 4.145.0 dry-run build passed using temporary package
aliases to the isolated dependency installation, including Stripe's Worker
entrypoint. The normal repository build still needs its dependency state fixed;
full lint/typecheck and scheduled integration validation remain outstanding.
No deployment or cron change was made. See
[the cutover procedure](./scheduled-worker-cutover.md).
