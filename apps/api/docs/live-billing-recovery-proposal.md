# Realtime billing recovery proposal

Status: follow-up design, not implemented by the initial GPT Live playground PR. No existing holds or charges are changed by this document.

## Decision

Charge evidenced usage, not an arbitrary reservation amount. Prevent uncontrolled losses by limiting exposure before provider work starts, preserving billing evidence and resolving exceptions through an audited queue. Keep the integration feature-gated until recovery and exposure limits are tested.

If all per-session evidence is irretrievably lost, exact customer charging and guaranteed recovery of every provider cent cannot both be promised. Unknown usage must not become guessed customer debt. Make that loss small, detectable and non-repeatable rather than repeatedly granting free sessions or capturing the entire hold.

## Current protection and gaps

The web API supplies trusted billing identity. A one-use credential connects to a server-owned Durable Object/provider socket. Clients cannot supply usage, prices or settlement amounts. Disconnects stop input, request provider closure and drain final voice/backend/tool events. Usage and deduplication identities are checkpointed; settlement uses the existing atomic wallet RPC.

Server ownership is not immunity to abuse. Clients can deliberately disconnect or stress legitimate paths without accessing the Durable Object. Infrastructure failures can also lose events innocently; a disconnect alone is not evidence of fraud.

Live closes when billing persistence fails. Existing budget checks extend holds or close sessions based on usage received so far. They do not prove a hard bound on outstanding managed backend/tool work or delayed usage. The initial $5 hold can grow and is not a provider-spend ceiling. After persisting `billing_unresolved` in the database, the relay clears local state, so unresolved recovery must operate independently from the socket.

## Implementation order

### 1. Bound exposure

Enforce a disclosed session spending ceiling, workspace concurrency limit and workspace-wide unresolved-exposure ceiling. Admission/reservations must be atomic across simultaneous sessions. Failed extensions or stale checkpoints must stop new work.

Headroom must cover pending input/context, maximum output, tools, voice until the next checkpoint and shutdown latency—not only completed responses. Prove the maximum outstanding work permitted by managed delegation. If it cannot be bounded before automatic execution, restrict that configuration or implement server-authorized client delegation separately. Do not advertise a hard cap based on estimates or assume socket closure immediately cancels backend work.

Repeated unresolved sessions should restrict new realtime exposure and alert operators; a cross-workspace spike should trip a provider-wide circuit breaker. Do not confiscate credit as a fraud penalty.

### 2. Preserve evidence and recover independently

Journal provider session/request IDs, creation intent, price snapshot, cumulative seconds, response/tool identities, terminal usage, completeness and versioned settlement intent. Keep audio, transcripts, prompts and credentials out of this billing journal. Record provenance and sequence/hash for replay and conflicting evidence.

Use an idempotent durable outbox for database projection/settlement. Keep the last evidence copy until a durable successor and recovery job are acknowledged. Retry the same settlement after an ambiguous commit; never issue an unrelated second charge. A separate sweeper must find stalled intents, unstarted reservations and unresolved cases.

Cloudflare alarms execute at least once and have limited automatic exception retries. Recovery must tolerate replay and explicitly reschedule/monitor long outages; browser reopening is not a recovery trigger. [Alarm contract](https://developers.cloudflare.com/durable-objects/api/alarms/)

OpenAI documents streamed Live usage and a hangup endpoint. Verify that a watchdog can terminate a primary-WebSocket session by persisted provider ID after relay loss; hangup success is not proof of recovered usage. The reviewed Live reference does not document a general historical usage-retrieval endpoint. Do not enable recordings just for billing or assume delegated Responses are retrievable when storage is disabled. Obtain a documented/provider-confirmed recovery contract before relying on it. [Live events](https://developers.openai.com/api/reference/resources/live/primary-websocket), [hangup](https://developers.openai.com/api/reference/resources/live/subresources/sessions/methods/hangup)

### 3. Add internal reconciliation controls

Suggested location: Internal controls → Billing reconciliation. Start with a read-only queue, then permission-checked actions through a transactional billing service, not raw table edits.

Show workspace/session, provider IDs, reason, age, last checkpoint, confirmed costs, unknown components, reserved/captured/released credit, exposure, recovery attempts and evidence provenance. Clearly distinguish confirmed usage, estimates and provider aggregate variance.

Actions should support retrying recovery; capturing verified final usage and releasing excess; settling a verified lower bound and writing off the unknown remainder; releasing an unused reservation with evidence or an explicit write-off reason; and retaining a bounded hold with an owner, reason and expiry. Partial captures require cumulative accounting so later evidence cannot charge the same units twice.

Every action needs authorization, idempotency, an expected record version, reason and immutable audit entry. Require second approval for large adjustments/overrides. Do not allow an unsupported charge simply to match an invoice. Later adjustments require the applicable customer policy and subtraction of prior captures, not automatic recharging after an unqualified final release.

Proposed operating limits: investigate within 24 hours, resolve within 72 hours unless a justified, notified extension is approved. These are proposed product limits, not existing enforcement or legal advice. Show held versus charged credit and provide a dispute path. Restrict further exposure instead of indefinitely freezing unrelated funds.

### 4. Reconcile supplier totals

Track provider usage, expected supplier rate-card cost, actual supplier net cost and customer charges separately. Credits/discounts are not metering errors. Dedicated project/key separation can reduce ambiguity but does not create per-session evidence.

The OpenAI Costs API supports daily buckets grouped by project, API key and line item, not session. An aggregate discrepancy is an investigation alert—not proof that one customer owes the difference. Repeat reconciliation after reporting delays. [Costs API](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/costs)

## Gates before broad rollout

- Crash/restart around provider startup, checkpoint, database commit and wallet acknowledgement boundaries.
- Bounded real tests of provider socket loss during delegation/search, watchdog termination and recovery.
- Concurrent admission, failed extensions, delayed usage and maximum pending backend/tool work remain within a defined exposure bound.
- Duplicate/conflicting events and sweeper/alarm/admin races never double-charge or resurrect released holds.
- Long database outages and exhausted alarm retries lead to recovery jobs, alerts and bounded exposure.
- Partial capture plus late evidence charges only the delta; expiry/write-off cannot be repeated for unlimited free usage.
- Billing-admin permissions and workspace isolation protect every view and action.
