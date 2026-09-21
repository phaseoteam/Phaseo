# Cache and routing health staging verification

Status: pricing repair and local test blockers resolved; PR/CI/review required before production Worker rollout.

## Scope

Clean branch `fix/gateway-production-cache-health-20260921`, based on remote main
`a4974fa70c42b1e1bfadd01f28ba7295b4de1866`, then rebased onto `c2a850fe6`
before the final staging check. No experimental request-state,
publication cron, escrow, or accounting projection implementation is included.
The existing optimized request path still uses authoritative database reads on
cache misses and uncertainty; it is not the database-free prototype.

Changes cover:

- Credential fills pinned to the version observed before database lookup.
- Unknown key/policy versions bypass stale caches; authoritative failures do not grant access.
- Key tombstones committed before invalidation; already-deleted retries retry invalidation.
- Website deletion surfaces failed invalidation rather than silently acknowledging it.
- Deferred credit-cache persistence for synchronous text, retaining the billing barrier.
- No in-flight health counter writes; useful completion evidence remains.
- Buffered internal streams report one health completion per provider attempt.
  Synthetic downstream output does not report that attempt again.
- Rejected requests send object-valued routing diagnostics to the analytics RPC.
- Public-catalog `checkedAt` tolerates at most 1 second of clock lead; source expiry,
  lifetime, model, endpoint, workspace, and alias checks remain in force.

## Remote changes

Only `phaseo-gateway-staging` was deployed. Latest version:
`cf9c5f89-690c-4cec-b332-86a38b5e9f12` (rebased release candidate).

With explicit user approval, the missing `cached_read_text_tokens` meter was
inserted at zero price for the active Laguna XS free SKU in production Supabase.
Exactly one row was inserted; replay inserted zero rows. No existing prices,
wallets, ledgers, schema, or grants were changed. The identical insert-only
migration is committed for CI replay; this manual DML did not mark a migration
version as applied. Isolated PostgreSQL regression coverage checks empty
catalogues, replay, nonzero existing prices, and out-of-scope SKUs.

The user explicitly approved retiring the staging-only `WorkspaceRequestState`
Durable Object. Migration v3 deletes that prototype state and adds
`RoutingHealthDurableObject`. The prototype KV binding was removed, not its KV
namespace. Production Worker versions, bindings, and Durable Objects were not
changed. Staging schedules remain disabled.

The deleted prototype state has no verified recovery copy. Do not roll back to
the old prototype deployment: any replacement must retain applied migration
history and valid class exports.

## Live evidence

Probes used disposable keys in the existing owned test workspace and verified
zero-priced Poolside routes. No wallet adjustments or paid provider probes were
performed. Every created key was revoked; the policy test's guardrail/link and
malformed staging KV marker were cleaned up and restoration verified.

- Revocation: 78 post-delete probes over 90 seconds. First rejection received
  3.906 seconds after deletion, with no acceptance after that rejection.
  Three requests in the initial stale-cache window were accepted by auth;
  malformed bodies prevented provider execution. This is LHR evidence, not a
  global revocation bound.
- Policy fault: all three probes rejected the temporary blocking guardrail
  despite a malformed version marker and a permissive old cache entry. The old
  entry was not overwritten under the unknown version.
- Analytics: live 400, 403, and provider-failure requests have analytics facts
  after replacing JSON null routing objects with empty objects.
- Cold failure reproduced: a database catalog timestamp 51 ms ahead of the
  Worker clock caused `gateway_public_catalog_changed_during_request` despite
  matching identity and valid expiry. Bounded clock tolerance corrected it.
- Laguna S after clock fix: dispatch overhead 371, 19, 6 ms; all HTTP 200, $0.
- Laguna S on final staging candidate: dispatch overhead 448, 3, 3 ms; all
  HTTP 200, $0. These measure receipt to first upstream dispatch, not provider
  response time, and are too few observations to establish a regional/global SLO.
- Final coordinator snapshot: version 3, exactly 3 successful Poolside
  observations, zero error EWMA, closed breaker. Publication followed the
  60-second coalescing alarm. No in-flight fields were incremented.

## Follow-up verification

- Laguna XS after repair: three HTTP 200 responses, each with 32 cached-input
  tokens and `cost_nanos = 0`. Receipt-to-first-dispatch overhead: **621, 3, 3 ms**.
  The fresh-key cache miss exceeded the 500 ms aspiration; both warm hits met
  the 100 ms ideal. The probe correctly exited nonzero for the cold latency
  target, not for a billing or request failure. Location: LHR only.
- XS request IDs: `db54d7b6-6f92-4218-b56b-8efd973aef60`,
  `6158d87f-8678-4e45-88ef-0740456cb154`, `0b0f21b4-65aa-4702-abb0-358c5351ab67`.
- Follow-up Laguna S request `2d935bed-3532-42f6-a950-2e1f5eb7a766` dispatched
  in 293 ms but Poolside returned HTTP 500, surfaced as gateway 502. The probe
  stopped and revoked its key. This is not a successful latency sample, and
  its null cost field is not evidence of measured zero cost.
- Final rebased candidate: XS HTTP 200, zero cost on all three requests;
  dispatch overhead **334, 18, 4 ms** (one context miss, two hits). Request IDs:
  `90668722-e154-43c6-aeb5-8d84c983523b`, `4f5d7999-ef70-4668-b0ec-71057bdd631e`,
  `17804d97-3f47-4cfa-9f60-a3763e4eecef`. Disposable key revoked afterward.
  Both observed latency targets passed; the earlier 621 ms result still stands.
- Full rebased gateway source suite now **4,417 passed, 0 failed** (578 files).
  The CLI fixture correction also landed on main; that upstream correction was
  retained during rebase, without changing permissions.
  Alibaba Responses recognizes `input_items` when mapping reasoning effort;
  six effort mappings and unchanged Chat behavior are tested.

## Remaining release limitations

No signed-in staging website or external-region runner was available.
Website revocation has deterministic route coverage, not browser end-to-end
evidence. Production rollout requires PR/CI/review gates. The small latency
samples do not establish a cold-start or global SLO.

## Local validation

- Focused auth, policy, key management, KV, credit barrier and health: 118 passed.
- Audit regression suite: 17 passed; context bundle/timing: 33 passed.
- Buffered completion, stream finalization, text/server-tool surfaces: 60 passed.
- Files/batches fixtures and buffered surface integration: 71 passed.
- Website deletion regression suite: 6 passed; full web API source suite: 584 passed.
- Gateway and web API TypeScript checks: passed.
- Relevant ESLint checks: no errors; existing large-file warnings remain.
- Global, EU, US Wrangler dry-run builds: passed.
- New pricing migration regression and migration history validation: passed.
- CI secret-boundary validation: 17 tests passed, policy check passed.
- Native coordinator validation: 103 observations, 101 replay checks, zero
  outbound requests; concurrency, restart, dedupe, stale reports and publication
  retries checked. Coordinated routing simulator: 9 passed.
- Pricing/before timing fixtures: 23 passed; isolated auth-cache performance passed.

## Cost interpretation

Production-style coordination batches KV health publication per active
endpoint/model pool. Successful buffered requests now correctly send completion
observations, so older measurements that omitted those reports cannot establish
the final production cost. No new per-user cron or per-request in-flight KV
write was introduced. A new measured cost baseline is still required before
quoting a production per-million-request figure.
