# Staging free-model measurement — 20 September 2026

## First-request improvement

Objective: bring Request Logs overhead below approximately 500 ms for fresh
API keys, preserving authentication, policy, pricing, and settlement ordering.
Scope: the existing synchronous text path on staging, not production deployment
or completion of the separately gated published request-state path.

Staging version `841d232e-708d-435b-b5f3-608b8a60266a` enables the existing
`GATEWAY_CONTEXT_BUNDLE_ENABLED` loader and overlaps credit-cache persistence
with non-streaming text inference. The existing request-owned barrier still
waits for the cache write before charging/invalidation. Media/async reservation
ordering is unchanged. No new schema, package, scheduler, or wallet changes.

Poolside XS failure was reproduced while tailing the staging Worker:
`pricing_rule_missing:cached_read_text_tokens`. The XS pricing data was not
changed in this latency slice. The benchmark switched explicitly to
`poolside/laguna-s-2.1:free`, whose input, output, and cached-input rates are zero.

Before deployment, six S-model requests succeeded: first-request overhead
457 ms, followed by 4, 9, 13, 6, and 3 ms. The first request spent 96 ms waiting
for the credit-cache write. This baseline illustrates variation; the earlier
643 ms XS sample is not a controlled same-model comparison.

After deployment, three sequential six-request runs each used a new key:

| Run | First-request overhead | Repeat overhead | Successes | Cost |
| --- | --- | --- | --- | --- |
| 1 | 292 ms | 3, 3, 3, 4, 4 ms | 6/6 | $0 |
| 2 | 263 ms | 4, 4, 12, 4, 3 ms | 6/6 | $0 |
| 3 | 200 ms | 4, 4, 3, 3, 12 ms | 6/6 | $0 |

First-request mean: **251.67 ms** (n=3). Repeat mean: **4.67 ms** (n=15).
All 18 request rows have status 200 and recorded cost 0. The initial post-deploy
request spent 100 ms authenticating, 160 ms loading context, and 32 ms in provider
admission. Its context used a 91 ms bundle RPC, zero separate enrichment time,
and zero blocking credit-cache write time.

These are fresh-key/context-miss observations at LHR, not proof of fully cold
Cloudflare/Supabase/shared caches or a worldwide latency guarantee. Public
catalog and workspace caches can be reused across keys. No caches were purged.
The existing path still reads Supabase on misses; the full published-path
migration remains gated in synthetic mode.

Post-deploy key IDs (all verified revoked and expired):
`0cecda12-58c8-4506-b9b1-8101a5ee94d9`,
`eb0e616d-5239-494b-99b5-a3d22b85680f`,
`6f5c67e6-1cf6-4b2e-a34e-b8b26bf0a87c`.
First generation IDs: `1fd50765-c357-446b-b695-2a6b33833d00`,
`095e7c1e-717b-405b-a6ef-19a4ae9a954e`,
`6512f623-ab74-4f0b-9140-a54793d55f90`.
Baseline S key: `dabb1305-a276-4402-865f-f4ce08f2e1c9` (revoked).
XS diagnostic key: `5c797eae-0779-4bda-8f55-ef519b37153d` (revoked).

Validation: 162 focused unit/integration tests passed across 15 files; API lint
and typecheck passed (40 existing max-lines warnings); staging dry-run and live
deployment succeeded. The updated barrier test covers all three text endpoints,
streaming and non-streaming. The full monorepo suite was not run. Prior staging
version for rollback is `ff8a34d3-a86b-4ebb-844f-1355369dcacc`.

## Initial XS probe (historical)

Endpoint: `https://api-staging.phaseo.app/v1/chat/completions`.
Model: `poolside/laguna-xs-2.1:free`, pinned to Poolside with fallback disabled.
Workspace: `Codex Live Workspace Manual` (production database, staging Worker).
Prompt: `Reply with the word hello.` Non-streaming, maximum 16 output tokens.

The production catalog's active route and all applicable meter prices were
checked as zero before dispatch. No wallet changes or deployment were made.
A temporary 15-minute key was created, then revoked and expired in `finally`.
Only two of the planned six sequential requests ran: the probe stops on errors.

| Sample | HTTP | Request Logs Phaseo overhead | Client total | Recorded cost |
| --- | --- | --- | --- | --- |
| First | 200 | 643 ms | 1,960 ms | 0 nanos |
| Second | 500 | 4 ms | 648 ms | NULL (not a recorded zero) |

Both requests reached the London (`LHR`) edge. The first had authentication
134 ms, context 463 ms, and provider admission 46 ms. Those sequential stages
sum to the recorded 643 ms. Nested context timings overlap and must not be
summed. The second had authentication 0 ms, context 4 ms, and provider admission
0 ms, but failed with `pipeline_execution_error` after the provider attempt.
The sanitized database error does not establish the underlying exception.

The Request Logs UI uses `detail_metadata.response_timeline.routing_ms`, not
the separate `phaseo_overhead_ms` column (NULL for both samples here). Client
total includes network and model time and is not Phaseo overhead.

The deployed staging configuration remains synthetic-only for the new request
state implementation. These real-key calls exercised the existing path.
They do not validate the new published path or establish a reliable average:
there is only one successful sample. The first sample is not proof of a cold
Worker or universally cold caches; the second's cache-read timing was 4 ms.

Correlation (transport header IDs differ from stored generation IDs):

| Sample | Transport request ID | Stored generation ID |
| --- | --- | --- |
| First | `968d5dd2-842d-426e-8ac4-c6eb43ae10a7` | `d6ddea39-a9bd-456e-bf59-af6a3285e80d` |
| Second | `1a5fbf81-e068-4d17-9f1d-803a23b510f9` | `809abd0f-00b6-47bd-b8fd-0b155e54ede3` |

Temporary key ID: `6fd60118-4727-4816-9f35-e46fa72d6687` (revoked).
The reusable bounded probe is `../scripts/measure-staging-free.mjs`; it reads
operator credentials from explicitly supplied dotenv files without printing
or persisting the temporary plaintext key.
