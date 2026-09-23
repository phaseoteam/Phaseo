# Independent workspace composition

The enabled workspace reader no longer copies settings or BYOK references into
the per-key dynamic and per-model static cache segments. A separate `runtime-v2`
namespace prevents mixed-version reads during rollout. The legacy disabled path,
presets, testing mode, free-router and non-text source paths remain unchanged.

Before credential hydration, the request composes validated current workspace
configuration with its independent admission, credit and catalog segments.
Attached private models are added afterwards so their credentials are not
overwritten by public-provider BYOK references. Financial/key decisions never
come from the workspace snapshot. The existing settings transformation is shared
with the legacy path, preserving consent, healing locks and billing mode.
Opted-in workspaces reuse a bounded, coalesced 30-second feature-gate decision,
never beyond the requesting snapshot's source expiry. Disabling consent in the
snapshot immediately skips this gate; it cannot restore consent from the cache.

Workspace source expiry is checked before/after asynchronous consent gating and
after credential hydration. Expired source failures reject instead of using
embedded stale settings. Catalog and admission leases retain their existing
deadlines; the short workspace lease no longer expires their cached segments.
Workspace generation changes still fence all composed segments.

Read-through source refills coalesce by workspace and generation, with at most
32 active source keys. Excess refills fail closed; completed/failed work is
removed and each reader receives its own copy. Mutation publication deliberately
does not join these reads: it must fetch its own post-commit source.

## Validation

- Actual context-pipeline fixtures verify an immediate warm repeat with zero
  external reads/writes and a 61-second workspace refresh using one source RPC
  and one workspace write, without rewriting key/catalog segments.
- Tests cover source failure, generation isolation, credential exclusion,
  admission preservation, cross-tenant rejection, consent-gate expiry, failed
  refill recovery, capacity and publication/read separation.
- Native workerd: 32 simultaneous cold compositions use one source read, one KV
  read and one KV write; 20 further warm compositions add zero external calls.
  Tenant separation, source ownership and stripping private configuration pass.
- Final source suite: 613 files / 4,841 tests passed. Type-check and targeted
  lint passed with the existing large-file warning in context.ts.

This removes one cause of coupled refills; it does not complete catalog
composition separation. Public provider/pricing data is still duplicated in
workspace-specific static KV entries. Credit refresh and authoritative limits
remain independent. Native fixture counts are not production invoice savings.
No new database migration, durable object, schedule or production flag is added.

## Staging evidence

Source `8b76670b8`, Worker `28f19897-089c-4059-9427-e2c4074b57b1` passed twelve
zero-charge Poolside XS/S requests in LHR across Chat/Responses/Messages and both
streaming modes. Routing ms: `[400,4,23,4,3,4,94,12,3,8,16,14]`. First requests
per model were 400/94 ms; ten follow-ups were 3–23 ms. All twelve operation
records completed with zero pending background tasks. Test key
`dcbea48b-5357-4721-8422-02d9abd7c864` was revoked.

A separate 14-request probe added two requests after a 61-second pause. All
fourteen passed and charged zero; the resumed requests routed in 233/26 ms.
The first resumed request still fetched admission: this existing test workspace
has no wallet, so its admission lease independently expires after 60 seconds.
This verifies compatibility across expiry, not the high-balance refill saving.
That saving is demonstrated by the local pipeline/native fixtures, not yet a
representative paid production workload. Test key
`0cb850f8-6622-4d22-b56f-5d66f69e43cc` was revoked. No balances were edited.

After the bounded contribution-gate follow-up, source `c78a561a0` was deployed
as Worker `38c949e2-e30f-4520-80b4-bdb395d5e3b1`. The twelve-case matrix passed
again with zero charges, routing ms `[293,4,28,3,4,4,126,5,4,14,18,4]`, and
disposable key `e1058c86-0df0-4df5-b9e5-1dc117dc31b4` revoked. The test workspace
does not opt into contribution; external-gate coalescing is covered locally.
