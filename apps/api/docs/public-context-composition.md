# Shared public context composition

With both context-bundle and workspace-runtime rollout flags enabled, ordinary
text routing no longer reads or writes workspace/model static KV entries. It
composes the existing global public catalog (bounded L1 + Cache API) with
independent key admission, credit and workspace configuration. The runtime-v3
namespace prevents older composed entries from being mistaken for this contract.
Presets, testing mode, free-router, non-text and disabled rollout paths retain
their existing behavior.

An eligible uncapped key can reuse its source-leased admission when changing
models. Public source expiry, eviction or a new model only refills public data;
it does not rewrite or extend admission/credit. Workspace settings expire and
refresh independently. Workspace/key generation changes still fence admission.
Configured key limits and workspace budgets still require source admission.
Credit invalidation still refreshes the wallet independently, including denials.

Cached admission is request-owned and checked for workspace, key, generation
availability and absolute expiry. It never enters the public cache, and the
catalog cannot manufacture gate decisions. Public alias resolution is independent
of the model-agnostic cached admission. Catalog/workspace/admission expiry is
checked again after asynchronous composition and credential hydration.

Public source refills coalesce by model/endpoints, with at most 32 active keys.
Completed/failed refills are removed; each waiter receives its own copy. Public
publication occurs once per source refill, with existing strict private-field
exclusion, size bounds and source deadlines. Mutation publishers do not join an
older source read. No new database object, queue, DO, schedule or binding is added.

## Validation

- Focused bundle/composition suite: 46 tests pass, including source failure and
  retry, tenant/key boundaries, alias change, lease expiry during a refill,
  unchanged admission deadlines, spending budgets and independent credit denial.
- Final full API source suite: 613 files / 4,852 tests pass.
- Type-check, targeted lint and staging dry-run pass; existing context.ts
  large-file warning remains.
- Native workerd executes the actual context pipeline. Two workspaces share
  three models; 32 simultaneous requests for a new shared model issue one public
  source call and one Cache API publication, zero additional admission or KV
  writes. Twenty warm calls add no external operations. No static KV copies are
  created, and a model change leaves existing admission/credit bytes unchanged.

## Cost boundaries

This removes a per-workspace/model KV read/write category, not every routing
operation. Existing authoritative admission, credit, policies, private routes,
BYOK hydration, health and accounting remain. Legacy pricing/modality fallback
enrichment is retained for compatibility; source misses are not database-free.
Catalog expiry still respects source and pricing boundaries. Fixture operation
counts are not a Cloudflare invoice or a production latency/cost guarantee.

The no-wallet free staging workspace cannot prove high-balance/paid-accounting
savings. Durable publication, durable settlement and representative paid/cost,
failure and regional validation remain production gates.

## Staging evidence

Source `7629d849f`, original staging Worker
`f42c1519-b87c-4b3c-b95e-5b05be3c0be8`, passed the twelve-case free Poolside
XS/S matrix twice (Chat, Responses, Messages; streaming and non-streaming), in
LHR. Both runs verified zero charges and revoked their disposable keys:
`9d3d01c7-21dc-4e95-80e7-b3a7abb6d120` and
`618a6b6a-b038-4728-a8ce-7b337899b79f`.

Routing ms: first run `[462,3,51,3,4,4,71,8,4,13,16,4]`; second run
`[268,4,39,3,3,3,10,7,4,12,11,7]`. These are routing overheads, not complete
provider-response times. The second run reused already populated public L2 data.

All twelve redacted operation records in the second run were complete, with no
pending background tasks. Totals: 49 KV reads, 14 KV writes, 24 Supabase table
reads, 26 mutations, 25 RPCs, 22 health RPCs and four Cache API reads. The prior
workspace-composition sample recorded 56/18 KV reads/writes, 24/26/26 Supabase
reads/mutations/RPCs, 22 health RPCs and two Cache API reads/two writes. These are
small sequential samples with different cache warmth, not a controlled invoice
reduction. Native fixtures establish the eliminated static-KV category.

Production, balances, bindings and disabled staging schedules are unchanged.
