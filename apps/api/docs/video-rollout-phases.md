# Video Rollout Phases

## Phase 1
- Provider async lifecycle baseline:
- Async operation records, webhook ingest, and reconciliation poller.
- Finalization moved out of status polling path.

## Phase 2
- Wallet reservation billing flow:
- Reserve credits at job creation (`hold`).
- Capture hold on provider completion (`capture`).
- Release hold on provider failure/cancel (`release`).
- Persist ledger entries for hold/capture/release with idempotent refs.
- Credit gates and wallet-facing balance use available credits (`balance - reserved`).

## Phase 3
- Asset durability and delivery in Cloudflare R2.

### Phase 3 Implementation Plan (R2)
- Goal:
- Ensure completed videos are copied to storage we control before provider URLs expire.
- Keep retrieval and billing independent from client polling behavior.

- Schema and metadata:
- Extend async video metadata with `asset_status`, `asset_storage_provider`, `asset_bucket`, `asset_key`, `asset_mime_type`, `asset_bytes`, `asset_etag`, `asset_stored_at`, `asset_error`, `asset_attempts`, `asset_last_attempt_at`.
- Use asset states: `none`, `provider_ready`, `downloading`, `stored`, `expired`, `failed`.

- Runtime bindings and config:
- Add R2 bindings and toggles (`VIDEO_R2_ENABLED`, `VIDEO_R2_BUCKET`, optional `VIDEO_R2_PREFIX`).
- Add size/time safety caps (`VIDEO_MAX_DOWNLOAD_BYTES`, `VIDEO_DOWNLOAD_TIMEOUT_MS`).

- Download and store flow:
- Trigger asset persistence when job enters `completed` from webhook or reconciler.
- Resolve provider output URLs from stored provider payload.
- Stream download from provider and stream upload to R2.
- Write metadata + `asset_status=stored` only after successful upload commit.

- Idempotency and concurrency:
- Use one deterministic object key per video id and provider variant.
- Guard store job with row-level lock on async operation metadata update.
- If already `stored`, skip.
- If `downloading` and lock age exceeds timeout, allow retry takeover.

- Retrieval behavior:
- Update `GET /videos/{id}/content` to serve from R2 when `asset_status=stored`.
- Fallback to provider only when not yet stored.
- Preserve existing auth checks and ownership checks.

- Reconciliation and retry:
- Extend scheduled reconciler to retry `provider_ready` and `failed` asset downloads with capped exponential backoff.
- Mark `expired` when provider URL is no longer valid and retries are exhausted.

- Observability:
- Emit structured events for asset transitions and latencies.
- Track metrics: store success rate, retry counts, time-to-store, expired-before-store count.

- Rollout:
- Ship behind `VIDEO_R2_ENABLED=false` by default.
- Enable for internal testing first, then a small canary team set, then full rollout.

### Rollout Readiness Checklist
- Billing:
- Hold/capture/release paths are idempotent and terminal-state driven.
- Late/out-of-order events do not cause duplicate or incorrect charges.
- Credit gate uses available balance (`balance - reserved`).

- Finalization:
- `failed` always releases reservation.
- `completed` captures reservation; legacy debit fallback only for no-reservation jobs.
- Webhook and poller races are safe due idempotent state transitions.

- Webhooks:
- OpenAI webhook verified and deduped.
- Alibaba webhook accepted with optional shared-secret auth and dedupe.
- Google Veo remains poll/reconciler driven (no native webhook path documented).

- Operations:
- Reconciler cron is enabled and bounded.
- Alerting exists for finalize failures, release/capture mismatches, and stalled pending jobs.

- Documentation:
- Internal runbook covers env vars, webhook setup, failure modes, and replay procedure.
