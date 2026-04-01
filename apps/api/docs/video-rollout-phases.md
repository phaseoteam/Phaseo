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
- Provider passthrough content delivery:
- Keep `/videos/{id}/content` as an authenticated proxy/pass-through to upstream provider content.
- Do not persist generated video bytes in first-party storage.
- Keep billing and lifecycle status independent from content persistence.

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
