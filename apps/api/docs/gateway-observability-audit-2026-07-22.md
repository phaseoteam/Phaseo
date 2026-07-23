# Gateway observability and persistence audit

Date: 2026-07-22

## Outcome

The gateway does not currently use the `evlog` package. It already follows part
of the same pattern: one Axiom wide event is assembled at request completion,
while a separate Supabase path persists billing and dashboard data.

The correct target is one request lifecycle with two independent projections:

1. **Axiom operational projection** — high-cardinality request diagnostics,
   routing decisions, attempts, timing breakdowns, edge context and errors.
   Successful events may be sampled; errors and slow requests must be retained.
2. **Supabase durable projection** — unsampled billing, usage, request facts,
   provider attempts and queryable dashboard dimensions. Raw I/O is excluded
   unless the workspace explicitly enables I/O logging.

The projections must not share a failure domain. Axiom availability must never
control billing persistence, and Supabase failure must not suppress the Axiom
request event.

## Current data flow

| Concern | Current destination | Current implementation | Finding |
| --- | --- | --- | --- |
| Operational request event | Axiom | `observability/events.ts` -> `observability/axiom.ts` | Strong wide-event coverage and redaction; direct one-event HTTP ingestion |
| Billing/request record | Supabase | `pipeline/audit/index.ts` -> `gateway_requests` | Authoritative and still required by production dashboard queries |
| V2 request metadata | Supabase | Dual-write to `v2_request_facts` and `v2_request_attempts` | Good target schema; live coverage is incomplete |
| V2 usage/pricing | Supabase | Tables and backfill migrations exist | Live gateway does not write `v2_request_usage` or `v2_request_pricing_lines` |
| Request/response bodies | R2 plus Supabase metadata | `pipeline/audit/io-logging.ts` | Correctly gated by explicit workspace/key I/O logging policy |
| Async video/batch lifecycle | Supabase plus targeted Axiom failures | Job/finalization modules | Separate lifecycle is appropriate because completion happens after the initiating request |
| Security/control-plane audit | No general gateway-wide sink | Feature-specific tables only | Request logs are not a substitute for actor/action/target security audit events |

There is also an unused legacy Axiom builder in
`pipeline/audit/axiom.ts`; production request events use
`observability/events.ts`. It should be deleted after confirming no external
imports rely on it.

## What the workspace dashboards need in Supabase

### Request explorer

- request ID and occurrence time
- workspace, app, key, session and end-user attribution
- endpoint, requested model, routed model and provider route
- success, HTTP status, error code and safe error summary
- stream/BYOK flags and finish reason
- latency, generation time, throughput, internal dispatch and total gateway time
- provider attempt order, result, status, failure class and duration
- native response ID

### Usage and spend

- input/output/total tokens and modality-specific meters
- exact pricing lines and charged nanos
- workspace/app/model/provider/key dimensions
- daily and short-window rollups with request, success, failure and rate-limit counts

### Provider health and routing transparency

- every attempted provider in order
- credential phase (priority BYOK, platform, fallback BYOK) without key material
- breaker/probe outcome, retryability and failure class
- selected provider and route/model identity

### Privacy boundary

`v2_request_facts.safe_metadata` must never contain prompts, completions, tool
I/O, provider bodies, authorization headers or decrypted BYOK material. Raw I/O
belongs only in the opt-in I/O logging path and its R2 objects.

## Changes made in this audit

- Added a single telemetry orchestrator which executes the Supabase and Axiom
  projections concurrently with `Promise.allSettled`.
- Applied it to success, execute-stage failure and before-stage failure paths.
- Added a structured Axiom operational event when the Supabase projection fails.
- Made Axiom ingestion report non-throwing HTTP/timeout failures to the
  orchestrator so delivery failures are visible in Workers logs.
- Preserved testing-mode behavior: synthetic performance requests reach Axiom
  but do not create billable/dashboard rows in Supabase.
- Added an unsampled, content-free provider-attempt timeline to every emitted
  request event. It includes attempt order, provider/model route, outcome,
  status, duration, credential phase, key source, probe/fallback flags and
  upstream timing, but excludes BYOK IDs, URLs, error text and payloads.
- Added the exact chosen-provider snapshot used by the request: provider family,
  offer/region variant, rollout/routing/capability statuses, execution/data
  regions, ZDR and training policies, data-policy confidence/contract mode,
  pricing availability, modality support and token limits.
- Added selected credential phase and probe state as first-class Axiom fields.

## Axiom coverage after this audit

| Diagnostic question | Axiom field group | Coverage |
| --- | --- | --- |
| What request failed and who owns it? | request/workspace/model/endpoint/status plus `error_*` | Always on emitted failures |
| Which provider and concrete route won? | `provider*`, model/service tier and selected attempt fields | Always on emitted requests |
| Which providers were tried and why did fallback occur? | `provider_attempt_timeline_json` plus attempt counters | Always on emitted requests |
| What provider policy/configuration did routing actually use? | rollout/routing/capability, region, ZDR/training and offer fields | Always when a chosen candidate exists |
| Where was the Worker executed? | `location`, city/country/continent/ASN and CF ray | Always when Cloudflare supplies it |
| Where was gateway time spent? | before/context/routing/adapter/upstream/after timing fields | Always when the stage reports it |
| What usage/cost was observed? | token/media/tool counters, throughput and cost nanos | Always when the provider reports it |
| Can prompts, completions or secrets enter compact events? | No request/response bodies; compact attempts omit identifiers/URLs/text | Prevented and tested |
| Can every emitted event survive an Axiom outage? | Direct HTTP ingest only | No; best-effort until Queue delivery exists |
| Are all background/control-plane failures represented? | Targeted finalization and telemetry-delivery events | Not yet; several jobs remain Workers-console only |

## Why the evlog package is not installed yet

The current evlog Workers adapter is usable, but its general drain pipeline
batches in isolate memory, flushes on an interval and expects an explicit
shutdown flush. Those delivery assumptions are not durable on Cloudflare
Workers. It also does not replace the typed Supabase billing projection.

Adopting evlog's request logger is reasonable after the event contract is
centralized, but Axiom batching should use a Cloudflare Queue (or direct ingest
as today), not an in-memory timer buffer. Installing evlog now would add a
second request logger without removing the existing duplicate builders.

## Remaining implementation plan

1. Define one typed `GatewayRequestLifecycleEvent` assembled once at completion.
2. Convert the Axiom builder and Supabase row builder into projections of that
   event; forbid destination-specific request reconstruction in callers.
3. Populate live `v2_request_usage` and `v2_request_pricing_lines` in the same
   durable Supabase transaction/RPC as the fact and attempts.
4. Add an idempotent database RPC keyed by `(workspace_id, request_id)` so retry
   cannot double bill and partial v2 writes cannot occur.
5. Compare legacy and v2 counts, cost nanos, usage meters and error totals for a
   shadow period. Alert on any mismatch.
6. Move workspace dashboards from raw `gateway_requests` scans to v2 facts,
   attempts and rollups. Keep the legacy dual-write until parity is proven.
7. Move Axiom delivery behind a Cloudflare Queue if direct-ingest volume or
   request-per-event cost becomes material; add queue age, retry and dead-letter
   alerts.
8. Add a separate append-only security audit contract for control-plane changes
   (`actor`, `action`, `target`, `outcome`, causation and safe diff). Never sample
   it and never mix it with request payload logging.
9. Remove the unused legacy Axiom builder and gradually replace remaining
   request-path `console.*` statements with request-scoped structured fields.

## Acceptance checks

- Every production request has exactly one Supabase fact and at most one Axiom
  `gateway.request` event before sampling.
- Every failed or slow request is retained in Axiom.
- Axiom outage does not change request response, charge or Supabase persistence.
- Supabase outage produces an Axiom `gateway.telemetry_delivery` error and a
  Workers error log without exposing request content.
- Legacy and v2 daily request counts match exactly; cost and usage totals have
  zero unexplained delta.
- I/O bodies are absent when I/O logging is disabled.
- No credentials, authorization headers or decrypted BYOK values appear in
  either destination.
