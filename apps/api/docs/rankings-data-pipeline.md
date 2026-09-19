# Rankings data pipeline

Rankings use content-free V2 usage meters, public daily rollups, the web API,
and independently rendered page sections. Weekly chart buckets use UTC; detail
tables cover the last 30 days. Public web API results have a 5-minute edge TTL
and a further 5-minute stale-while-revalidate window.

| Section | Measurement |
| --- | --- |
| Text | Input and output text tokens |
| Image | Generated image count; image input count as a separate metric |
| Embeddings | Provider embedding/input tokens from embedding requests |
| Rerank | Reported rerank quadtokens, or the existing character-based estimate |
| Audio | Audio tokens, with measured audio seconds separately |
| Video | Generated video seconds, with video tokens separately |
| Speech | Measured audio seconds from speech requests |
| Transcription | Measured audio seconds from transcription and translation requests |

The gateway persists embedding, rerank, speech, and transcription workload meters
alongside existing billing meters. The additional workload meters are not
billable and do not affect pricing. Image counts come from explicit counts or
observed content/output items, never image tokens or a requested generation count.
Unknown durations remain absent; characters do not imply an audio duration.

`v2_rpc_gateway_model_usage_daily` reads canonical meter names and historical
aliases without adding both. It filters hidden models and unavailable/stealth
routes consistently with the other public usage projections. Reads aggregate
meters only for selected rollups. No raw customer content is exposed.

Completed video jobs call `upsert_gateway_request_into_workspace_usage_rollup`
after updating `gateway_requests`. This hook now replaces the V2 duration meter
idempotently and requeues the existing analytics outbox. It does not settle or
modify billing. Calls are scoped by workspace, request ID, and partition timestamp;
only the backend role can execute the hook.

Return Rate reads `public_model_workspace_usage_weekly` through a service-role
RPC. The service role needs SELECT on that RLS-protected table; direct client
roles remain denied. Cohort privacy thresholds remain unchanged. A successful
empty response means insufficient qualifying observations. HTTP failures show a
retryable unavailable state instead.

## Rollout

1. Apply `20260919120000_repair_public_rankings_meters.sql` and
   `20260919121000_restore_request_usage_rollup_sync.sql` through the normal
   database migration process.
2. Deploy the gateway, web API, and web app together. Existing API responses and
   SDK contracts are unchanged; new web API metric values are additive.
3. Allow the existing analytics outbox processor to refresh affected grains and
   the public cache to expire. Confirm each Rankings tab and Return Rate's HTTP
   status after deployment.

These migrations do not backfill facts or replay billing. Existing video/cache
meters become readable immediately after the projection change. Missing
embedding/rerank/image-count measurements and separate speech/transcription
durations populate from newly recorded traffic. Historical repair, if needed,
requires a separately scoped, bounded backfill from authoritative records.

## Local validation

- Gateway: usage-column, audit, and tool-usage Vitest suites.
- Web API: public rankings route Vitest suite.
- Web: RankingsPageContent Jest suite (all eight modalities, units, partial
  failure, and successful empty data).
- SQL: `supabase/tests/rankings-meters.test.mjs` and
  `supabase/tests/rankings-video-sync.test.mjs`; set `PGLITE_MODULE` to an installed
  `@electric-sql/pglite` module URL.

Production diagnostics were read-only: Return Rate returned HTTP 503 and the
backend role lacked SELECT; the old per-request sync function returned false
without updating anything. No production migration or deployment is part of
the local verification.
