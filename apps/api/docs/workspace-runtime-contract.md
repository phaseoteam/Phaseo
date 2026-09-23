# Workspace runtime read contract

This additive contract separates shared workspace settings and enabled BYOK
credential references from model catalog data and key-specific admission. It is
the contract stage, not an enabled cache or a completed publication migration.

`20260923221019_gateway_workspace_runtime_snapshot.sql` adds two read-only RPCs:

- `gateway_fetch_workspace_runtime(uuid)`: an explicit allowlist of routing,
  privacy, logging, contribution, healing and automatic-routing settings;
  configured tier, billing mode and enabled BYOK references grouped by provider.
- `gateway_fetch_request_context_bundle_v2(...)`: authoritative key/context and
  budget checks, with optional public catalog and workspace snapshot payloads.
  A trusted Worker may omit a payload only after validating its cached lease.

Both are security-invoker functions with an empty search path and execute access
restricted to `service_role`. No tables, customer data, financial state, existing
RPC signatures or grants on existing RPCs are changed. Existing table indexes and
access policies remain in effect; this introduces no new query predicate beyond
the existing workspace enrichment reads.

The snapshot contains no credential plaintext/ciphertext, wallet balance,
reservations, spending limits, key permissions, computed admission tier or raw
plugin configuration. New settings columns are not automatically published.
Configured tier is metadata, not permission to bypass calculated admission tier.

The database fixes the source lease at 60 seconds using statement time. Readers
validate tenant/provider identity, strict field types and absolute expiry, with
at most one second of database/Worker clock lead, consistent with public catalog
reads. Reads must never extend that deadline. Cache input is capped at 256 KiB
using conservative UTF-16 size accounting; oversized valid source data must use
an uncached path rather than being truncated or rejecting an existing workspace.

## Validation and rollout

`node supabase/tests/workspace-runtime-snapshot.test.mjs` uses local PGlite and
validates actual SQL output with the Worker's TypeScript schema. It covers repeat
application, unchanged legacy RPC, grants/security/search path, tenant/key
isolation, secret exclusion, disabled BYOK keys, missing settings, absolute
leases, optional payloads, live wallet reservations and configured/exceeded
budgets. No external services or customer rows are used. Node 22 before 22.18
requires `--experimental-strip-types` for this test.

The 28 snapshot unit cases cover malformed/oversized cache entries, strict
secret/financial-field rejection, provider identity, clock skew, lease limits,
nullable defaults and independently owned decoded data. API type-check passes.

Apply the additive migration only with explicit shared-database approval, then
enable and test a separate Worker reader increment on staging. Until then the
existing bundle remains in use. Rollback is to keep the reader disabled; neither
dropping functions nor changing customer rows is needed. This stage makes no
latency, KV savings, live deployment or instantaneous invalidation claim.

On 2026-09-23, explicit approval was received and the two functions were applied
to the shared database as migration `20260923221019`. Live permission checks
confirmed service-role-only execution, security-invoker behavior and an empty
search path. The legacy bundle and key-admission definitions remained unchanged.
A read-only service-role transaction verified the test workspace's schema,
identity, 60-second source lease and exclusion of financial authority. No table
data or production Worker configuration was changed. Reader activation and its
staging evidence are tracked in `workspace-runtime-cache.md`.
