# GPT Live playground verification

Verified on 11 September 2026 through the authenticated local playground, web API and gateway. This public summary excludes private account records and local browser artifacts.

## Live results

| Scenario | Voice | Provider seconds | Completed delegations | Charge USD |
| --- | --- | ---: | ---: | ---: |
| Spoken calculation, normal Stop | Marin | 28 | 1 | 0.023547533 |
| Two calculations, graceful close | Cedar | 45 | 2 | 0.037965000 |
| Browser socket disconnect during backend response | Willow | 9 | 1 | 0.007712800 |
| Web search, actual tab close and reopen | Marin | 37 | 1 | 0.042446533 |
| Actual tab close during web search, then reopen | Marin | 5 | 1 | 0.015805067 |

Free locally synthesized speech replaced microphone input in temporary browser tabs. Production PCM capture, relay, recognition, delegation, output handling and usage display ran unchanged. No user microphone recording was made. Output caps and automatic close timers bounded the sessions. Total charges were $0.127476933, within the authorized $0.50 budget.

Calculation answers were correct. Audio events were received for all three voices; this is not a subjective listening-quality assessment. In the interrupted backend test the browser saw only `response.created`, but the server subsequently collected the completed response and its usage.

## Billing evidence

Read-only reconciliation checked each session against its reservation, wallet ledger and gateway request summary. No direct database mutation was used.

- Independent integer-nanodollar calculations matched every capture and request cost.
- Each session had exactly one ledger charge, complete final usage and no pending response.
- Captured plus released credit equalled the reservation; no test left credit held.
- Each search produced exactly one $0.01 tool charge despite multiple progress events.
- Cache writes were separate from ordinary input. Reasoning was included in output, not billed twice.
- Tab closure during search still settled backend/search usage. Reopening was idle and did not duplicate settlement.

The authenticated provider dashboard independently confirmed voice seconds at $0.05/60 and the search charges. Backend quantities and published-rate calculations reconciled too. Customer charges are not necessarily exact net-invoice pass-through: account-specific allowances, discounts and credits can reduce provider net cost without changing usage.

## Reproducible checks

From `apps/api`:

```sh
pnpm exec vitest run src/core/live-billing-matrix.test.ts src/core/live-sessions.test.ts src/core/live-delegation.test.ts src/core/live-sessions.settlement.test.ts src/core/realtime-relay-security.test.ts src/core/realtime-relay-lifecycle.test.ts src/routes/v1/data/live-sessions.test.ts
pnpm exec tsc --noEmit
```

From `apps/web-api`:

```sh
pnpm exec vitest run src/routes/chat.realtime.test.ts src/routes/chat.test.ts
pnpm exec tsc --noEmit
```

From `apps/web`:

```sh
pnpm exec jest --runInBand --runTestsByPath 'src/components/(chat)/rooms/realtimeAudio.test.ts' 'src/components/(chat)/rooms/LiveSettings.test.tsx'
node scripts/run-realtime-audio-smoke.cjs
node scripts/realtime-room-smoke.cjs
```

Browser scripts require installed Microsoft Edge and existing workspace dependencies. HTTP and WebSocket traffic is mocked or blocked; no real sessions or paid calls are used. Artifacts under `output/playwright/` must not be committed. The room harness covers audio, microphone denial, blocked playback, stalled capture, keyboard interaction and desktop/mobile scrolling.

Targeted suites passed: 190 API tests, 18 web API tests and 13 web tests. API and web API type-checks, both Worker dry-run builds and the full web production build passed. The web build reported homepage prerender fetch diagnostics and four Help Centre filesystem-tracing warnings outside this change. Earlier offline browser checks also passed. Main and settings Scroll Areas remained height constrained while content overflowed.

## Limits

This does not live-test every voice, setting/tier, cache reads, long sessions, concurrent settlement, full Worker/process loss or subjective audio quality. Deterministic fixtures cover more billing failures but cannot establish reliability under every infrastructure fault.

Missing authoritative usage remains `billing_unresolved`, retaining a hold rather than inventing a charge or silently releasing it. See the [recovery proposal](live-billing-recovery-proposal.md) before broad rollout.
