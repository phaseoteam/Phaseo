---
name: phaseo-database-changes
description: Design and implement internal Phaseo Supabase schema, migrations, RLS, RPCs, indexes, and data-access changes safely. Use when a website, gateway, catalog, billing, analytics, async job, or provider feature needs durable database state in this monorepo.
---

# Phaseo Database Changes

Use this skill for internal database work in the Phaseo monorepo. Treat the
SQL schema, API data-access code, RLS policies, RPC contracts, fixtures, and
reports as one change. Desired definitions live in `supabase/schemas/`.
Read `supabase/AGENTS.md` and `supabase/DECLARATIVE-SCHEMAS.md`; edit the SQL
definitions, generate forward migrations with
`pnpm db:schema:sync -- -f descriptive_change_name`, and commit both together.
Catalogue content is owned by Supabase: use the connected Supabase plugin's
`execute_sql` for targeted data changes and readback. Schema authoring uses
the declarative workflow, not direct live DDL. A model or pricing release does not need a data-only migration or a
JSON fixture PR.

## Inventory the source of truth

For catalogue content, use the Supabase plugin to inspect the live `v2_*`
tables and comparable rows. For schema, RPC, or application data-access work,
read the repository database instructions and inspect:

- `supabase/schemas/`, `supabase/migrations/`, and `supabase/tests/`;
- `apps/api/docs/v2-data-model.md` and the relevant API route/RPC callers;
- `apps/api/docs/database-driven-provider-adapters.md` for provider control
  plane ownership and fail-closed behavior;
- `apps/api/docs/async-preview-rollout.md` for async operations, billing
  alerts, and notification-delivery state;
- generated database types, query helpers, fixtures, and existing migration
  regression harnesses.

Find the closest existing table, RPC, policy, index, and test before adding
another abstraction. Establish whether the requested change is schema,
authorization, query performance, derived reporting, data repair, or a
combination.

## Protect financial and lifecycle invariants

Treat `wallets`, `credit_ledger`, wallet reservations, gateway requests,
`gateway_async_operations`, billing alerts, and delivery attempts as
accounting or lifecycle state, not ordinary CRUD. Explicitly define:

- units and sign conventions, including nanos versus display currency;
- balance, reservation, available balance, usage, estimated cost, settled
  cost, and ledger movement as separate concepts;
- reservation, capture, release, settlement, retry, cancellation, and
  reconciliation transitions;
- idempotency keys, uniqueness constraints, concurrency behavior, and the
  source of truth for each derived value;
- authorized roles and whether the operation must run through a trusted
  service/RPC boundary.

Do not weaken the existing rule that authenticated clients cannot directly
mutate protected financial state. Do not correct negative balances, replay
settlement, backfill ledger rows, or delete duplicate records as part of a
normal feature change. Such work needs an explicit repair scope, evidence,
rollback plan, and separate approval.

## Design a schema or RPC migration

1. State the invariant and the old/new schema or RPC contract.
2. Use the repository's migration naming and deployment conventions. Keep
   migrations forward-only and safe to run once; make backfills bounded,
   resumable, observable, and idempotent when they are authorized.
3. Add or review indexes for real query predicates, joins, RLS checks, and
   time-window reports. Consider write/storage cost and retention.
4. Enable RLS deliberately. Define `SELECT`, `INSERT`, `UPDATE`, and
   `DELETE` policies separately, keep backend-only tables default-deny, and
   review `SECURITY DEFINER` functions for a fixed search path, narrow grants,
   caller authorization, and no accidental privilege escalation.
5. Keep data ownership in the right layer: catalog/provider identity and
   routing control belong to the database where the repository says they do;
   protocol mechanics belong in code; derived chart/report rows must retain
   their metric definition and time semantics.
6. Update typed data access, RPC wrappers, fixtures, test helpers, reports,
   and documentation in the same change. Never hand-edit generated output
   when a generator or schema source exists.

## Test the boundary

Run `pnpm db:schema:check` to verify desired definitions against the frozen
baseline and newer migrations. Use `pnpm db:schema:smoke` for disposable replay
and an incremental migration trial, plus the relevant SQL contract tests.
Preserve existing migrations and `supabase/baseline/` SQL/history hashes.
Do not apply the replay baseline to production, repair remote migration records,
or bypass the replay tooling with raw `db diff`, declarative `sync`, or root
`db reset`. Inspect exports for drift before refreshing locally edited definitions.

Add deterministic SQL or application tests for:

- valid writes and reads for each authorized role;
- denied cross-workspace access and denied direct client mutation;
- NULL, zero, negative, duplicate, retry, and concurrent cases where they
  are meaningful;
- idempotent RPC behavior and atomic wallet/ledger transitions;
- migration ordering, indexes, RLS, grants, and function security;
- report rollups, time boundaries, units, and redaction;
- async restart, duplicate webhook, cancellation, and finalization paths when
  lifecycle state changes.

For catalogue data-only changes, read back the affected Supabase rows and
assert the intended IDs, statuses, effective dates, aliases, and pricing
meters. The archived JSON validators do not validate live catalogue data.

For schema, RPC, or application data-access changes, run the narrow SQL
regression harness first, then the affected API/web API tests and relevant
repository validation gates:

~~~text
pnpm --filter @phaseo/gateway-api test
pnpm --filter @phaseo/web-api test
pnpm typecheck
~~~

Use the exact project-specific database test command documented by the
affected migration or package. Do not run a live migration or data repair
against staging or production without explicit authorization. If a query is
only validated against local fixtures, say so.

## Completion report

Report the Supabase project and rows changed for catalogue updates, with
readback evidence. For schema or RPC work, report migration files, invariant
and authorization changes, affected callers, tests, rollout and rollback
limits, and any unresolved production risk.
