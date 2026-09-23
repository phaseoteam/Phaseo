# Workspace policy serving leases

The private effective-policy snapshot is workspace/key/version scoped. The v3
envelope carries a 60-second absolute source deadline measured before database
loading. L1 lasts at most 30 seconds and cannot extend the source deadline.
Legacy, expired, future-dated or identity-mismatched entries require source
revalidation. This bounds stale policy independently of eventually consistent
KV version markers; it is not an instantaneous global-revocation guarantee.

The previous count-only map is replaced by a 4 MiB / 2,000-entry bounded LRU,
with a 256 KiB per-entry ceiling and 32 concurrent refills. Workspace version
reads are also coalesced and limited to 32. Requests receive separately parsed
objects so nested rule mutation cannot affect another request. There is no SWR
for authorization. Unavailable or malformed version markers still require
authoritative source policy and cannot reuse a permissive old snapshot.

A mutation overtaking a local refill forces revalidation once; another race
fails closed. KV fill failures do not undo an authoritative result, but they are
reported. Mutation publication acknowledgement remains a separate responsibility.

The snapshot covers effective restrictions, guardrails and dynamic routes. It
is not the complete WorkspaceRuntimeSnapshot: tier, plugin/BYOK refs and central
website/control-plane publication remain separate plan work. No financial
admission or ledger semantics change in this increment.

Validation: 605 source test files / 4,727 tests pass; typecheck, focused lint,
Worker dry-run and native Workers tests pass. Native 32-request cold burst makes
three KV reads (workspace marker, key marker, policy), four source queries and
one KV publication; the immediate warm request makes no external operations.
Local mutation revalidation passes. Staging validation pending.
