# Batch API Pre-Push Security Audit

Date: 2026-07-17

## Executive summary

No unresolved critical or high-severity security finding was identified in the pending Batch API changes. Authentication, Statsig access control, workspace ownership, managed webhook secrets, provider-event idempotency, wallet reservations, and terminal billing all fail closed in the reviewed paths.

Three defense-in-depth findings were fixed during this audit. The remaining release prerequisites are operational: rebase onto current `main`, apply the billing-security migration, run the controlled live-provider matrix, and keep xAI execution disabled until its production credential is accepted by the native Batch API.

## Scope

- Batch and file API authentication, authorization, feature gates, and workspace isolation.
- Provider webhook signature verification, replay handling, persistence, and recovery.
- User webhook endpoint authorization, secret storage, delivery validation, and retries.
- Reservation, settlement, key-limit accounting, idempotency, and reconciliation.
- Provider output parsing and pricing across the supported provider adapters.
- xAI batch-pricing visibility independent of gateway execution support.

## Findings resolved

### BATCH-SEC-001: Provider webhook bodies were not explicitly bounded

- Severity: Medium
- Location: `apps/api/src/routes/internal/batch-webhooks.helpers.ts:307`
- Impact: An unauthenticated caller could make the worker read and authenticate an unnecessarily large webhook body, increasing memory and CPU consumption.
- Fix: Provider webhook bodies are now streamed with a 1 MiB ceiling before signature verification or event persistence. Oversized requests receive HTTP 413.
- Verification: Tests cover both declared and streamed oversized bodies.

### BATCH-SEC-002: Provider signature headers were retained in event metadata

- Severity: Low
- Location: `apps/api/src/routes/internal/video-webhooks.helpers.ts:472`
- Impact: Provider signatures and similarly named credential headers were retained beyond the verification boundary without an operational need.
- Fix: Persisted provider-event headers now exclude authorization, cookie, signature, token, secret, and API-key header names while retaining non-sensitive event and request identifiers.
- Verification: A regression test asserts that signature and API-key headers are removed.

### BATCH-SEC-003: xAI result pagination allowed excessive accumulation

- Severity: Medium
- Location: `apps/api/src/core/batch-provider-adapters.ts:630`
- Impact: A malformed or compromised upstream response could cause excessive pagination and in-memory result accumulation during reconciliation.
- Fix: xAI result retrieval is capped at 10 pages and 10,000 entries, matching the gateway batch-request limit.

## Controls verified

- All batch and file routes authenticate and enforce the Statsig Batch API gate before accessing data or providers.
- Batch and file records are always queried with the authenticated workspace ID.
- Input files cannot be reused across workspaces or providers.
- Batch webhooks require a managed endpoint ID; inline plaintext signing secrets are rejected.
- Managed webhook secrets use AES-GCM encryption, versioned key material, one-time disclosure, and admin-only rotation.
- Provider webhooks require fresh signed timestamps, use timing-safe comparison, and deduplicate on provider plus event ID.
- Webhooks trigger authoritative provider reads and retain scheduled polling/replay fallback.
- User webhook destinations require HTTPS, reject local/private literals and DNS results, reject redirects, and use bounded delivery timeouts.
- Provider submission intent and the wallet hold are persisted before native submission.
- Ambiguous submissions retain their hold and enter recovery instead of being released or retried blindly.
- Definitive provider rejection releases the hold through idempotent finalization.
- Successful output counts, usage, models, and price cards must reconcile before billing is marked complete.
- Reservation settlement and key-usage persistence are idempotent and retryable; failures remain unbilled for reconciliation.
- Database security-definer functions use fixed search paths and are executable only by `service_role`.
- The pending diff contains no detected API keys, webhook secrets, private keys, or service-role assignments.

## xAI pricing

The pricing catalog and production pricing table contain active `batch` rows for `spacex-ai/grok-4.3` on `text.generate`, including the documented 20% discount. The pricing UI derives available plans from explicit pricing rows, not from the Batch API execution allowlist. A regression test at `apps/web/src/components/(data)/model/pricing/providerPlanRouting.test.ts:150` now protects that separation.

xAI execution remains `blocked` in the Batch API provider-readiness configuration and is absent from the preview provider allowlist. Pricing can therefore be displayed without implying that Phaseo currently accepts xAI batch submissions.

## Residual release requirements

1. Rebase the branch onto current `origin/main` before committing.
2. Apply `supabase/migrations/20260716170000_batch_billing_security_invariants.sql` before deploying the worker.
3. Confirm production webhook encryption keys and OpenAI/Gemini provider webhook secrets are present after deployment.
4. Run one controlled live batch through OpenAI, Gemini, Anthropic, and Mistral after the migration and worker deployment.
5. Keep Groq and Together experimental and xAI blocked until live settlement evidence is captured.
