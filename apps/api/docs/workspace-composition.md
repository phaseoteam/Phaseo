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
- Full source suite: 613 files / 4,838 tests passed before the two additional
  refill tests, which also passed in the focused suite. Type-check and targeted
  lint passed with the existing large-file warning in context.ts.

This removes one cause of coupled refills; it does not complete catalog
composition separation. Public provider/pricing data is still duplicated in
workspace-specific static KV entries. Credit refresh and authoritative limits
remain independent. Native fixture counts are not production invoice savings.
No new database migration, durable object, schedule or production flag is added.
