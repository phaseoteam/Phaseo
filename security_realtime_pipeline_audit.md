# Realtime Voice Security and Billing Audit

Date: 2026-07-10

Scope: Next.js chat proxy, public realtime API routes, wallet reservations, Cloudflare Durable Object relay, provider usage normalization, final settlement, reconciliation, catalog pricing, and realtime UI lifecycle.

No paid provider sessions were run. Review evidence came from source inspection, deterministic tests, and current official provider/Cloudflare documentation.

## Remediation status

All RT-001 through RT-012 findings have now been addressed in the worktree. The hardening adds paced and bounded PCM ingress, Durable Object storage and alarm-backed settlement retries, relay-owned reconciliation, atomic create/extend/settle database functions, reservation-level capture/release accounting, idempotent request summaries, standard key/model/provider policy gates, bounded metadata, sanitized errors, and shared Google voice/transcription setup.

The deterministic API suite and TypeScript checks pass without contacting a provider. Migrations `20260707170000` through `20260710220000`, plus corrective migration `20260710234000`, were applied to the linked Supabase project. A remote zero-cost transactional smoke test passed for initial hold, hold extension, settlement, idempotent repeat settlement, reservation audit rows, wallet restoration, and cleanup. Supabase lint reports no remaining issue in the realtime functions.

## Executive summary

The provider rate cards are correct for the currently configured models:

- OpenAI realtime models are token-priced, including separate text, audio, and cached-input meters.
- Gemini 3.1 Flash Live Preview is token-priced at the catalog rates currently checked in.
- xAI Grok Voice is priced at $0.05 per minute of audio sent or received plus $0.004 for billable text-input events.

At the time of the audit, the implementation was not ready for an untrusted production rollout. Three confirmed critical paths could produce upstream spend that was not protected by the wallet hold: clients could send audio faster than realtime, reconciliation could settle a still-live relay without closing its provider socket, and relay settlement failures were swallowed after volatile usage was discarded. The remediation status above records the subsequent fixes.

## Critical findings

### RT-001: Client audio is neither size-limited nor paced to realtime

- Severity: Critical
- Location: `apps/api/src/core/realtime-relay-durable-object.ts:427`
- Evidence: Every `client.audio` payload is accepted, its base64 length is converted to duration, and it is immediately forwarded upstream. There is no maximum frame size, bytes-per-second budget, cumulative audio-to-wall-clock bound, WebSocket backpressure check, or per-session ingress rate limit. Budget persistence is throttled to once every two seconds at lines 557-576.
- Impact: A valid session holder can send minutes or hours of PCM in a short burst. The 25-minute timer limits wall-clock connection time, not billable audio volume. Provider cost can therefore cross the $5 reservation before usage is persisted, priced, or used to extend/close the hold.
- Fix: Enforce a small maximum frame size, reject malformed base64/PCM, and maintain a server-side token bucket based on decoded samples and elapsed monotonic time. Permit only a small jitter allowance above realtime. Stop forwarding before the conservative exposure estimate reaches the reserved amount. Continue using provider usage as the sole final charge source for token-priced providers; the local estimate is only an exposure guard.
- Mitigation: Until fixed, keep the feature admin-only and enforce a strict Cloudflare rate limit on session creation and relay messages where possible.

### RT-002: Reconciliation can settle a live session without terminating its relay

- Severity: Critical
- Location: `apps/api/src/core/realtime-sessions.ts:1150`, `apps/api/src/core/realtime-relay-durable-object.ts:427`
- Evidence: The cron directly calls `settleRealtimeSession` for idle/expired database rows. It does not contact the session's Durable Object or close its upstream socket. The relay continues forwarding audio based only on its in-memory `acceptingAudio` flag. If a later usage write sees a terminal row, `updateRealtimeSessionUsage` simply returns it; the relay still does not stop.
- Impact: A client can open a provider session, remain silent until the five-minute idle reconciliation releases/captures the hold, then resume sending audio through the still-open upstream connection. The later Durable Object settlement is idempotently ignored because the database session is already terminal, so post-reconciliation provider spend is uncharged.
- Fix: Make the Durable Object the lifecycle owner. Reconciliation must send a terminate-and-settle command to the named object and wait for acknowledgement, or use a durable per-object alarm. The database settlement RPC must never terminalize an active relay independently. The relay must also re-check terminal state before every forwarded message and close immediately if the row is terminal.
- Mitigation: Disable idle reconciliation for connected sessions until the termination handshake exists; retain expiry cleanup only for sessions that never connected.

### RT-003: Settlement failures are swallowed after volatile usage is abandoned

- Severity: Critical
- Location: `apps/api/src/core/realtime-relay-durable-object.ts:668`
- Evidence: `settled` is set to `true` before the settlement RPC. Any exception is logged and swallowed, then both sockets are closed and the in-memory usage aggregate is discarded. Usage and lifecycle state are not persisted in Durable Object storage. Database usage snapshots can lag by two seconds and may precede the final provider usage event.
- Impact: A transient Supabase/RPC failure at session end can permanently lose the authoritative final usage and leave the provider bill unpaid. Reconciliation can only retry from the older database snapshot and may fail closed forever if token meters were not persisted.
- Fix: Persist the latest aggregate and a `settlement_pending` record before attempting settlement. Do not mark the object settled until the RPC confirms an applied or already-applied terminal result. Retry with a Durable Object alarm using an idempotency key, and only discard state after confirmed settlement. Preserve final provider events before closing upstream.
- Mitigation: Alert on every `realtime_relay_settle_failed` and quarantine the associated workspace/session for manual recovery.

## High findings

### RT-004: Google usage events are overwritten instead of accumulated

- Severity: High
- Location: `apps/api/src/core/realtime-relay-durable-object.ts:172`
- Evidence: `googleUsageToAggregate` replaces each modality total with the newest non-zero `usageMetadata` value. Google's Live API documentation describes usage metadata for response(s), while its billing guidance says each turn reprocesses and rebills the accumulated context. The API documentation does not guarantee session-cumulative usage events.
- Impact: If each usage event describes its response/turn, only the latest turn is billed by StatSync even though Google bills every turn, including the repeatedly processed context. Long conversations would be increasingly undercharged.
- Fix: Confirm event semantics with captured, non-paid fixtures or an explicitly approved minimal live fixture. Track event identity/turn boundaries and add each billable event exactly once. Do not blindly sum duplicate snapshots; use a provider-specific accumulator with monotonic/event-id deduplication.
- False-positive note: This finding can be downgraded only if Google documents or captured fixtures prove that Live `usageMetadata` is session-cumulative for this model and endpoint.

### RT-005: Final settlement can spend funds reserved by other sessions

- Severity: High
- Location: `supabase/migrations/20260707170000_realtime_voice_sessions.sql:181`
- Evidence: Settlement checks `wallet.balance_nanos >= final_cost`, not `final_cost <= this session's held amount`. It then subtracts the full cost while releasing only this session's held total from `reserved_nanos`.
- Impact: If a session costs more than its hold, it can consume balance backing another active reservation. The other session can subsequently fail settlement with insufficient balance even though its hold succeeded. If the wallet lacks enough balance, settlement remains non-terminal and the hold can stay stranded indefinitely.
- Fix: Prevent upstream exposure from exceeding the session hold. In SQL, explicitly distinguish `cost <= held` from debt/overage. Never consume another reservation's backing funds silently. Record overage debt in a separate recoverable state and atomically settle the held portion.

### RT-006: Realtime creation bypasses normal API-key spend/request limits

- Severity: High
- Location: `apps/api/src/routes/v1/data/realtime-sessions.ts:158`, `apps/api/src/pipeline/before/guards.ts:359`
- Evidence: Realtime routes call only `guardAuth`. Normal generation routes call `guardContext`, which enforces daily, weekly, and monthly request/cost limits and model/provider eligibility. Realtime also does not apply an endpoint-specific OAuth scope check.
- Impact: A valid key or OAuth token can use realtime after its configured spend/request limit is reached and may bypass model/provider restrictions expected elsewhere in the gateway. The wallet hold limits total workspace balance but does not enforce per-key governance.
- Fix: Run the same trusted context and key-limit checks for `audio.realtime`, including provider/model capability resolution and OAuth scope enforcement, before creating the row or reservation. Re-evaluate cost limits when extending a hold.

### RT-007: Initial reservation and session state are not atomic

- Severity: High
- Location: `apps/api/src/core/realtime-sessions.ts:689`
- Evidence: Session insert, wallet reserve, session reservation update, and relay-secret update are separate operations. The reservation update at lines 736-744 ignores its error. If the later relay-secret update fails, the function throws without settling/releasing the successful hold.
- Impact: A session can own a real $5 hold while its row reports zero reserved funds, disabling budget enforcement. Other failure permutations strand credits for up to reconciliation time and return an error even though wallet state changed.
- Fix: Move session creation plus initial reservation into one database RPC/transaction. Return the committed row from that RPC. If secret hashing must remain outside SQL, add a compensating idempotent release path for every subsequent failure and reject relay startup unless the row's reserved amount matches active reservations.

## Medium findings

### RT-008: Settlement summary insertion is not idempotent

- Severity: Medium
- Location: `apps/api/src/core/realtime-sessions.ts:1049`, `apps/api/src/core/realtime-sessions.ts:1074`
- Evidence: The wallet RPC is idempotent, but `insertRealtimeGatewayRequestSummary` runs even when settlement reports `already_applied`. `gateway_requests.request_id` is indexed but not unique on the partitioned table. The summary uses the current caller's computed cost rather than the committed session's final cost.
- Impact: A reconciliation/relay race can create duplicate usage rows and rollups or record a cost different from the wallet charge. Wallet balance remains single-charged, but analytics, spend limits, and customer-visible usage can be inflated.
- Fix: Insert the request summary only when settlement was newly applied, or use a dedicated idempotent summary table/RPC keyed by session ID. Source cost and usage from the committed terminal row.

### RT-009: Reservation audit records misstate partial capture/release

- Severity: Medium
- Location: `supabase/migrations/20260707170000_realtime_voice_sessions.sql:203`
- Evidence: Every active reservation row is marked `captured` whenever final cost is non-zero, even when final cost is less than total held. The rows retain their original full amounts and do not set `captured_at`/`released_at`, while the session claims part was released.
- Impact: Reservation-level audit data disagrees with wallet/session totals. Future reconciliation or reporting that sums captured reservation amounts can overstate revenue and makes incident reconstruction unreliable.
- Fix: Represent partial capture explicitly, or capture only the amount charged and release the remainder with ledger-linked rows. Set terminal timestamps and enforce an invariant that reservation terminal amounts reconcile exactly to wallet and session totals.

### RT-010: Raw internal/provider errors and session internals are overexposed

- Severity: Medium
- Location: `apps/api/src/routes/v1/data/realtime-sessions.ts:80`, `supabase/migrations/20260707170000_realtime_voice_sessions.sql:60`
- Evidence: Unknown errors are serialized into API responses, including database details/hints/codes and provider response text. Authenticated workspace members also have direct `select` access to all session columns, including instructions, metadata, provider errors, and the relay-secret hash.
- Impact: Schema details, provider diagnostics, user prompts, and operational identifiers can be disclosed more broadly than necessary. This increases the value of a compromised workspace account and may expose sensitive custom instructions.
- Fix: Return stable public error codes with a request ID; retain details only in structured server logs. Remove direct table select or expose a restricted view that excludes prompt/error/hash fields.

### RT-011: Relay messages and metadata lack bounded resource validation

- Severity: Medium
- Location: `apps/api/src/routes/v1/data/realtime-sessions.ts:29`, `apps/api/src/core/realtime-relay-durable-object.ts:427`
- Evidence: Instructions and scalar fields are bounded, but arbitrary `metadata` has no serialized-size/depth/key limit. WebSocket JSON and base64 audio have no frame limit before parsing/forwarding.
- Impact: Authenticated clients can cause excessive Worker memory/CPU, database bloat, or large upstream frames. This compounds RT-001 and can terminate the Durable Object before settlement.
- Fix: Apply strict request-body, metadata, JSON-depth, WebSocket-frame, and decoded-audio limits before allocation or provider forwarding.

### RT-012: Google relay ignores selected voice and transcription configuration

- Severity: Medium (functional correctness)
- Location: `apps/api/src/core/realtime-relay-durable-object.ts:344`
- Evidence: The relay's Google setup sends response modality and optional system instruction only. It does not send `speechConfig`, `inputAudioTranscription`, or `outputAudioTranscription`, even though the non-relay helper builds those fields.
- Impact: The selected voice may not be honored and transcript behavior differs from the UI contract. Missing transcription can also make diagnostics appear inconsistent, though official token usage should remain the billing source.
- Fix: Use a provider adapter shared by relay and any direct transport so setup shape, voice, transcription, and usage parsing cannot drift.

## Test and operational gaps

- The nine deterministic billing-helper tests pass, but there are no Durable Object runtime tests, no SQL settlement integration tests, and no reconciliation tests.
- Add Worker-runtime tests for disconnect during output, provider close/error races, settlement RPC failure/retry, eviction after 15 minutes, faster-than-realtime input, oversized frames, concurrent hold extension, cron/relay races, and duplicate provider usage events.
- Add database tests proving wallet balance, reserved balance, reservation rows, ledger rows, session totals, and request summaries reconcile under partial capture, overage, duplicate settlement, and concurrent sessions.
- Add alerts for settlement failures, terminal rows with active relay traffic, final cost above held amount, stale holds, duplicate realtime request summaries, and provider usage with zero customer charge.

## Positive controls already present

- Provider API keys remain server-side in the relay.
- Public session creation forces the server-owned relay.
- Relay secrets are high-entropy and stored as hashes.
- Final wallet settlement is restricted to internal callers and the SQL RPC serializes on the session row.
- OpenAI `response.done` usage is used as the authoritative token source.
- The checked-in OpenAI, Google, and xAI price rates match current official provider pricing.

## Recommended release gate

Do not expand beyond admins until RT-001 through RT-007 are fixed and covered by Worker-runtime plus database integration tests. RT-001, RT-002, and RT-003 should block any untrusted production traffic.

## Primary documentation reviewed

- OpenAI Realtime server events and model pricing: https://platform.openai.com/docs/api-reference/realtime-server-events/response/done and https://developers.openai.com/api/docs/models
- Gemini Live API reference, billing guidance, and pricing: https://ai.google.dev/api/live, https://ai.google.dev/gemini-api/docs/live-api/best-practices, and https://ai.google.dev/gemini-api/docs/pricing
- xAI Voice Agent pricing: https://docs.x.ai/developers/models/voice-agent-api
- Cloudflare Durable Object lifecycle, WebSockets, and alarms: https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/, https://developers.cloudflare.com/durable-objects/best-practices/websockets/, and https://developers.cloudflare.com/durable-objects/api/alarms/
