# Realtime Voice Security and Billing Audit

Date: 2026-07-12

Scope: chat feature gating, public realtime API creation, gateway authentication and workspace policy, wallet holds, Cloudflare Durable Object relay ownership, OpenAI/Google/xAI usage capture, terminal settlement, reconciliation, database access, and operational release controls.

No paid provider sessions were run. Evidence came from source inspection, deterministic tests, the linked Supabase schema, and current official provider and Cloudflare documentation.

> Remediation update, 2026-07-13: RT2-001 through RT2-013 have been addressed in the feature worktree. The detailed findings below are retained as the original audit record; their release conclusions are superseded by the remediation and release-gate sections below.

## Executive summary

The critical billing and relay ownership races are closed. Token-priced providers retain the wallet hold in a durable `billing_unresolved` state when authoritative terminal usage is unavailable; relay ownership is atomically claimed before provider I/O; and wallet, reservation, session, and canonical request finalization now commit in one database transaction.

Selected-user chat rollout is server-gated and the public API remains disabled by default. Workspace policy, per-user/key/workspace creation limits, a cross-workspace provider concurrency guard, terminal-state compare-and-set updates, service-role-only billing RPCs, and unresolved-billing alerts are enforced. No paid provider smoke test was run as part of remediation.

## Remediation status

- RT2-001: provider-specific drain/cancel is followed by a terminal-usage wait; missing authoritative usage retains the hold for reconciliation.
- RT2-002: `created -> connecting` is an atomic database claim and terminal rows cannot be resurrected.
- RT2-003: wallet settlement and `gateway_requests` finalization are atomic; rollup failure remains owned by the Durable Object retry path.
- RT2-004: workspace model/provider policy is applied at creation and reevaluated during hold extension.
- RT2-005: realtime is not self-service; admins or the server-side Statsig cohort are entitled, and `REALTIME_PUBLIC_API_ENABLED` defaults to `false`.
- RT2-006: creation is atomically limited per user, key, and workspace; a provider-wide insert trigger serializes and caps shared-account concurrency.
- RT2-007: usage updates only target active statuses and reload committed terminal state after a race.
- RT2-008: Google usage is accumulated as per-turn snapshots and committed once after turn completion plus usage metadata.
- RT2-009: relay claims reject expired sessions and alarms do not grant a fresh lifetime.
- RT2-010: inactive managed chat keys fail closed and require an administrative recovery action.
- RT2-011: abnormal provider closure requires a completed provider response; pending token usage becomes unresolved rather than successful.
- RT2-012: context-window compression is enabled and Google sessions are capped at 15 minutes until `GoAway` resumption is implemented.
- RT2-013: reconciliation uses an exact internal path and a deployment-derived authentication token.
- Database access: every realtime wallet/session RPC explicitly revokes execute from `PUBLIC`, `anon`, and `authenticated`; linked privilege checks confirm only `service_role` can execute them.

## Critical findings

### RT2-001: Disconnect settlement can undercharge an in-flight response or strand its hold

- Severity: Critical
- Locations: `apps/api/src/core/realtime-relay-durable-object.ts:627`, `apps/api/src/core/realtime-relay-durable-object.ts:760`, `apps/api/src/core/realtime-sessions.ts:634`
- Evidence: After a client leaves, the relay waits 20 seconds and then calls `settle`. `settle` closes the provider socket before invoking billing. `assertRealtimeBillingMetersPresent` accepts any non-zero prior cost or any existing token meter, even when `assistant_response_in_flight` is true.
- Impact: After one completed turn, a user can begin another expensive response and close the tab. If its final usage has not arrived within 20 seconds, the session can be charged using only prior-turn usage. On the first turn, settlement can instead fail forever after the upstream has already been closed, because the final token event can no longer arrive.
- Provider evidence: OpenAI documents that `response.cancel` produces a terminal `response.done`, that `response.done` is always emitted for completed/cancelled/failed/incomplete responses, and that its usage corresponds to billing. The relay does not send that cancellation and wait for its terminal event.
- Required fix: For token-priced providers, send the provider-specific cancel/end-input event, continue reading until the current response's terminal usage arrives, persist it, and only then close upstream and settle. Never accept stale token totals while a response is in flight. If authoritative usage cannot be obtained, transition to a durable unresolved-billing state and retain the hold for reconciliation.

### RT2-002: A relay token can race two connections and resurrect a settled session

- Severity: Critical
- Locations: `apps/api/src/core/realtime-relay-durable-object.ts:308`, `apps/api/src/core/realtime-relay-durable-object.ts:343`, `apps/api/src/core/realtime-sessions.ts:892`
- Evidence: `fetch` checks `this.client` before awaiting the Supabase token lookup. Cloudflare permits requests to interleave across non-storage I/O. Two concurrent upgrades can both pass the initial check and both read a `created` row before either assigns the client or changes database state. The upstream connection is opened before `markRealtimeSessionConnected`, and that update has no `status = created` predicate.
- Impact: One paid session can open multiple provider sockets, overwrite the Durable Object's in-memory socket references, and lose usage from the unowned connection. Reconciliation can also settle a session while provider connection setup is awaiting I/O, after which the unconditional connected update can change the terminal row back to `connected` even though its hold was released.
- Required fix: Atomically claim `created -> connecting` in the database before provider I/O, fail if no row was claimed, and persist a Durable Object connection claim before any await that permits interleaving. Make every lifecycle transition compare-and-set against the expected prior status. Never allow terminal states to transition back to active.

## High findings

### RT2-003: Wallet settlement and the canonical usage record are not one durable operation

- Severity: High
- Locations: `apps/api/src/core/realtime-sessions.ts:1008`, `apps/api/src/core/realtime-sessions.ts:1033`
- Evidence: The wallet settlement RPC commits first. `gateway_requests` is then upserted separately, and any summary/rollup error is caught and only logged. The Durable Object treats settlement as successful and deletes its pending state.
- Impact: Customer credits can be charged while the request remains missing or pending in usage history. Key spend limits, analytics, rollups, invoices, and support evidence can disagree with the wallet, with no component retaining ownership of a retry.
- Required fix: Finalize the request summary in the settlement transaction, or atomically write an outbox row that must be acknowledged before the Durable Object deletes settlement state. Reconciliation must repair summary/rollup failures idempotently.

### RT2-004: Realtime bypasses workspace model and provider policy

- Severity: High
- Locations: `apps/api/src/routes/v1/data/realtime-sessions.ts:210`, `apps/api/src/pipeline/before/guards.ts:359`, `apps/api/src/pipeline/before/index.ts:360`
- Evidence: Realtime calls `guardContext` and immediately creates the session. The normal request pipeline separately calls `fetchWorkspacePolicy` and `applyWorkspacePolicy` after `guardContext`; realtime never does so.
- Impact: Workspace/key model allowlists, model blocklists, provider allowlists, and provider blocklists can be bypassed through realtime. This violates tenant governance and can route audio to a provider that a workspace administrator prohibited.
- Required fix: Apply the same workspace policy to the resolved realtime model and candidate provider list before creating the hold. Reapply relevant policy when extending a long-lived session.

### RT2-005: The limited rollout gate is self-service, and the public API has no rollout gate

- Severity: High
- Locations: `apps/web/src/app/(dashboard)/settings/beta/actions.ts:27`, `apps/web/src/lib/statsig/server.ts:40`, `apps/api/src/routes/v1/data/realtime-sessions.ts:183`
- Evidence: Any authenticated user can write `chat_realtime_voice: true` through the beta settings action. The server-side check reads that database value; it does not evaluate the Statsig gate or admin segment. Separately, `POST /v1/realtime/sessions` has no rollout entitlement check at all.
- Impact: Deploying the code makes the chat feature available to any user who opts in and makes realtime available to every valid public API key with sufficient funds. This is not an admin or selected-user rollout.
- Required fix: Enforce an immutable server-side entitlement/admin/allowlist check in both the web session proxy and gateway creation route. Do not trust a user-editable beta preference as authorization. Use separate rollout controls for chat and public API exposure.

### RT2-006: There is no per-user/workspace active-session or creation-rate limit

- Severity: High
- Locations: `apps/api/src/routes/v1/data/realtime-sessions.ts:183`, `apps/web/src/lib/server/chatGatewayAuth.ts:194`
- Evidence: Session creation performs authentication, context checks, and a wallet hold, but no active-session count or endpoint rate limit. The managed chat key is created with all request and cost limits set to zero. Ongoing realtime requests are not inserted into `gateway_requests` until final settlement.
- Impact: A member can create concurrent sessions until the shared wallet is tied up in $5 holds, consume provider concurrent-session quotas, and bypass request/cost limits that only observe finalized request rows. This is both tenant denial of service and provider-quota abuse.
- Required fix: Add atomic active-session caps per user, API key, and workspace; a creation token bucket; and a provider/account concurrency cap. Include active reservations/estimated spend when evaluating cost limits.

### RT2-007: Usage persistence can overwrite a terminal settlement

- Severity: High
- Location: `apps/api/src/core/realtime-sessions.ts:914`
- Evidence: `updateRealtimeSessionUsage` reads an active row, performs external context/pricing work, then updates by workspace/session only. Settlement can terminalize the row during those awaits; the late update then overwrites usage, pricing, and potentially status after the final charge was calculated.
- Impact: The terminal session can display usage and estimated cost that do not match the wallet charge or request summary. A policy result can also write `ending` over a terminal status.
- Required fix: Move usage/version updates into a compare-and-set RPC using an expected version/status. Reject late writes to terminal rows and have callers reload the committed terminal record.

### RT2-008: Google usage events are not correlated or deduplicated by turn

- Severity: High
- Locations: `apps/api/src/core/realtime-relay-durable-object.ts:217`, `apps/api/src/core/realtime-relay-durable-object.ts:582`
- Evidence: Every `usageMetadata` message is blindly added to the session aggregate. Google documents that usage messages can be sent periodically. There is no event/turn identity, snapshot handling, or deduplication. `googleUsageSeen` is never reset, so after the first turn a later `turnComplete` can mark a response complete even when no usage for that turn has arrived.
- Impact: Multiple usage snapshots for one turn can be double charged; delayed or missing usage on later turns can be undercharged. The direction depends on provider event timing, so the current implementation cannot establish billing accuracy.
- Required fix: Implement a Google-specific turn accumulator with explicit turn boundaries and captured fixtures defining whether each usage payload is a delta or snapshot. Do not settle a turn until its corresponding usage event is present.

### RT2-009: Expired relay credentials can start a fresh 25-minute lifetime

- Severity: High
- Locations: `apps/api/src/core/realtime-sessions.ts:810`, `apps/api/src/core/realtime-relay-durable-object.ts:740`
- Evidence: Relay authentication checks the hash and `created` status but not `expires_at`. If an expired row has not yet been reconciled, connection is allowed. `scheduleExpiryAlarm` treats an already-expired timestamp as invalid and schedules a new alarm 25 minutes in the future.
- Impact: A stale or leaked relay credential can revive an expired held session. Reconciliation outages make the credential usable beyond its intended lifetime.
- Required fix: Reject relay upgrades at or after `expires_at`, atomically expire the row, and schedule already-expired sessions for immediate settlement rather than a fresh fallback duration.

### RT2-010: The managed chat key defeats an operator pause

- Severity: High
- Location: `apps/web/src/lib/server/chatGatewayAuth.ts:243`
- Evidence: If the deterministic managed chat key exists with any status other than `active`, ordinary chat authentication writes it back to `active`.
- Impact: Pausing the key during abuse or incident response is not durable; the next authenticated user request re-enables it and can resume realtime spend.
- Required fix: Never automatically reactivate an existing paused/disabled/revoked key. Treat the status as an authorization failure requiring an explicit administrative recovery action.

## Medium findings

### RT2-011: Abnormal provider closure can be recorded as a successful completed session

- Severity: Medium
- Location: `apps/api/src/core/realtime-relay-durable-object.ts:454`
- Evidence: Once any provider event has been seen, a later socket close is settled as `completed` unless budget closing is active. It does not require a terminal provider event or complete usage.
- Impact: Provider/network failures can appear successful and can settle stale usage. This compounds RT2-001 and obscures incident detection.
- Required fix: Track provider-specific terminal response state. Unexpected closure without terminal usage must be failed/unresolved, not completed.

### RT2-012: Google sessions advertise 25 minutes without enabling the documented extension mechanism

- Severity: Medium (availability)
- Locations: `apps/api/src/core/realtime-sessions.ts:17`, `apps/api/src/core/realtime-sessions.ts:276`
- Evidence: The product limit is 25 minutes. Google's current documentation limits audio-only Live sessions to 15 minutes unless context-window compression/session management is enabled. The setup enables neither compression nor resumption and does not handle `GoAway`.
- Impact: Google sessions can terminate unexpectedly around 15 minutes, below the product's advertised limit.
- Required fix: Either cap Google at 15 minutes or implement context compression, `GoAway`, and session resumption with usage continuity across upstream connections.

### RT2-013: The internal reconciliation HTTP endpoint has no caller authentication

- Severity: Medium (defense in depth)
- Location: `apps/api/src/core/realtime-relay-durable-object.ts:308`
- Evidence: Any POST path beginning `/internal/reconcile/` is accepted by the Durable Object. It is currently reachable only through the Worker binding, but the method itself has no secret or typed-RPC boundary.
- Impact: A future route forwarding mistake or binding reuse could expose forced settlement.
- Required fix: Prefer a typed Durable Object RPC method or require a per-deployment internal secret and exact path match.

## Operational and test gaps

- The realtime implementation and migrations are currently untracked in the worktree. The exact audited code cannot be reproduced or reviewed in CI until it is committed on the feature branch.
- There are no Workers runtime tests for concurrent WebSocket upgrades, request interleaving, provider cancellation, provider close before terminal usage, alarm retry, or Durable Object eviction.
- There are no linked-database tests for partial capture, overage, concurrent sessions, usage-update-versus-settlement races, or atomic request-summary finalization.
- The linked Supabase project still has unrelated schema lint errors. `gateway_fetch_request_context`, which realtime depends on, has a broken preset-specific SQL branch (`users.id` does not exist). Ordinary realtime model IDs do not enter that branch, but the shared dependency should be repaired before a broad API release.
- There is no reconciliation comparing customer charges against provider billing exports or xAI's exact cost metadata. This is needed to detect provider semantic drift and rounding differences.
- Required alerts are missing for settlement retries, unresolved billing, terminal rows with active upstream traffic, final cost above held amount, stale holds, duplicate/missing request summaries, and provider usage with zero customer charge.

## Positive controls

- Provider API keys remain server-side in the Durable Object.
- Public creation forces the server-owned relay; browser clients receive only a high-entropy relay secret stored as a hash.
- The relay validates base64 PCM, frame duration, cumulative audio duration, faster-than-realtime ingress, and upstream backpressure.
- Metadata, instructions, and request fields are bounded.
- Realtime tables are no longer directly selectable by authenticated clients.
- Wallet create/extend/settle functions are transactional and settlement is idempotent.
- OAuth access fails closed because no realtime generation scope exists.
- The OpenAI/Google token price cards and xAI audio-duration price card pass catalog pricing validation.

## Verification performed

- `pnpm --filter @ai-stats/gateway-api exec vitest run src/core/realtime-sessions.billing.test.ts src/core/realtime-relay-security.test.ts src/core/wallet-reservations.test.ts` - 19 tests passed after remediation.
- Targeted web Jest suites for Statsig entitlement, room configuration, and room registration - 21 tests passed.
- API lint/typecheck, web typecheck, changed-file web ESLint, Worker dry-run build, and Next.js production build passed.
- `pnpm validate:pricing` - 1,304 pricing entries validated.
- `pnpm validate:data` and `pnpm validate:gateway` passed.
- `pnpm exec supabase db lint --linked --level error` - no realtime-function errors; unrelated legacy errors remain.
- Linked rollback-only security smoke - hold creation, duplicate claim rejection, unresolved hold retention, atomic settlement, terminal callback rejection, wallet restoration, and zero surviving rows passed.
- Linked privilege assertions confirmed all realtime lifecycle RPCs deny `anon`/`authenticated` and allow `service_role` only.

## Release gate

The implementation is suitable for a controlled admin/Statsig chat cohort after the Worker changes and Durable Object migration are deployed. Keep `REALTIME_PUBLIC_API_ENABLED=false` during this phase, monitor `realtime_billing_unresolved_alert`, and perform one deliberate manual session per provider before adding users.

Do not enable the public API until real provider invoice/export data has been reconciled against gateway charges over a meaningful sample and unresolved-billing operations have a documented response process. The automated suite intentionally does not spend provider credits.

## Primary documentation

- OpenAI Realtime API reference: https://developers.openai.com/api/reference/resources/realtime
- Google Live API reference: https://ai.google.dev/api/live
- Google Live API best practices: https://ai.google.dev/gemini-api/docs/live-api/best-practices
- xAI Voice Agent API: https://docs.x.ai/developers/models/voice-agent-api
- Cloudflare Durable Object rules: https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/
- Cloudflare Durable Object lifecycle: https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/
- Cloudflare Durable Object WebSockets: https://developers.cloudflare.com/durable-objects/best-practices/websockets/
