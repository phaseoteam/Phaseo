# Provider catalog v1.2 implementation verification

Status: PR #3107. Initial migration generation, schema equivalence and full replay passed in CI. Review follow-up changes require a new generated migration and replay.

## Implemented

- Strict v1.2 schema and parser with training, retention, ZDR, agreement/settings requirements, evidence and optional notes per tier/capability. Rich model/tier declarations additionally cover typed media limits, parameter descriptors, scoped/conditional/cache pricing, throughput/concurrency, identity, discounts and deployment metadata. Their application status is documented in `apps/web-api/docs/provider-catalog-fields.md`.
- Legacy compatibility and policy-preserving draft import/export, including remote and managed feeds.
- Declarative approval/audit tables, replaceable catalog-owned declarations, a service-role effective policy view, and public/gateway RPC projections. Manual pins remain separate.
- Admin-only approval read/write API, source/evidence binding, independent approval audit, withdrawal/downgrade behaviour, 24-hour expiry and a five-minute gateway/public cache boundary.
- Gateway fallback, free routing and service-tier reads use the effective projection. Web consumers reject expired cached guarantees.
- Conditional declarations remain non-granting until account fulfilment can be independently verified. Feed ZDR grants are limited to non-batch text generation.
- SQL integration cases are included in the declarative smoke script. No production schema, approvals or six existing manual guarantees were changed.

## Local proof

- Focused web API Vitest run: **110 passed across 11 files** (typed declarations, catalog policy/tier/override/sync/webhook, pricing, settings and admin review suites). The declaration fixture covers all five input kinds, all eight output kinds, recursive descriptors, conditional and scheduled prices, cache qualifiers and capacity scopes; the published JSON schema validates it and draft round trips preserve it.
- Focused gateway Vitest run: **87 passed across 9 files** (policy, tier routing, shared/catalog cache, fallback aliases, free router, inflight, provider strictness and Nebius context).
- Web Jest run: **16 passed across 3 files** (`catalogDataPolicy`, pricing table and ZDR resolver).
- Web API and gateway `tsc --noEmit`: passed. The SDK was built locally to satisfy the web API dependency.
- Web API and gateway Worker dry-run builds: passed. Neither was a deployment.
- Targeted web API ESLint: passed. Gateway ESLint: no errors, one existing context-file size warning. Web ESLint: no errors, existing component/fetcher warnings remain.
- `pnpm docs:links`: passed, no broken links.
- Initial web standalone type check failed because Next-generated `LayoutProps` types were absent. `pnpm --filter @phaseo/web exec next typegen` generated route types; the follow-up web `tsc --noEmit` passed.

Vitest exercises real Hono request/response handling with mocked persistence. For example, the approval PUT returns 401 for a non-admin and 200 for an admin, with the current source and authenticated actor saved server-side. It does not prove the SQL functions execute successfully.

- Declarative replay-history tooling: **4 Node tests passed**. This tests replay tooling invariants, not the new SQL.
- `git diff --check`: passed.

## Historical local database limitation (resolved in CI)

`pnpm db:schema:sync -- -f provider_catalog_v12_data_policy` failed with:

```text
docker: command not found (podman also not found) â€” install Docker Desktop or Podman and ensure it is on PATH
```

This initial local attempt generated no migration. The CI generation run later produced the committed migration, and equivalence/replay checks passed. Do not repeat initial generation for that completed change. Review follow-up SQL changes still require their own generated forward migration and fresh checks; do not deploy application changes against an older schema.

Once a local runtime is available, run:

```sh
pnpm db:schema:sync -- -f provider_catalog_v12_data_policy
pnpm db:schema:check
pnpm db:schema:smoke
```

Review the generated migration, ensure the approval/audit objects, helper/view, triggers and altered promotion/pricing/gateway functions are included, and execute `provider_catalog_data_policy.sql` plus existing retention contracts. Check SQL permissions, source replacement, false/null/downgrade withdrawal, batch/stateful denial and admin-pin preservation before opening a release PR.

Production approval, provider coordination and manual-pin transfer remain separate rollout steps. A dedicated admin console, conditional-account activation and non-text ZDR grants remain outside this initial implementation.

## Internal provider verification (2026-10-21)

The branch was rebased onto current main before publication. A reusable synthetic
feed now covers native standard, native batch, retained/resold and agreement-only
offers. See `apps/web-api/docs/provider-catalog-testing.md`.

- Focused web API command listed above: **111 passed across 11 files** after rebase.
- `node supabase/tests/catalog-data-policy.test.mjs`: **passed**, executing the real
  SQL resolver against isolated PGlite fixture tables. Approval, negative controls,
  revocation, expiry, source replacement, null/false withdrawal and manual pins pass.
- `node supabase/tests/gateway-admission-history.test.mjs`: **passed**.
- `node supabase/tests/gateway-spend-limit-seed.test.mjs`: **passed**.

The first CI generation run (39604949833) failed because the legacy request-context
fixture did not load the new resolver dependency. The fixture now loads the real
resolver and the two affected tests pass locally. Generation was retried using the
existing credential-free disposable database workflow. Full migration equivalence,
promotion/audit replay and browser/live gateway proof remain separate release gates.

## Generated migration and CI follow-up

Disposable generation run 39619249773 succeeded. Reviewed and committed
`supabase/migrations/20261021144702_provider_catalog_v12_data_policy.sql` plus its
generated dependency manifest. The earlier missing-migration gate above is resolved;
schema equivalence and full replay still need to pass before deployment.

The first full web API CI suite reported 1 failure and 1,126 passes: a garbled
Unicode offset symbol in the existing lifecycle validation message. Restoring the
original UTF-8 message from main fixes that regression:
`pnpm --filter @phaseo/web-api test -- src/routes/account/provider-catalog.test.ts`
returned **21 passed**. The local attempt to rerun the entire suite was cancelled
before test execution; do not count it as a pass. The updated CI run must provide
full-suite proof.
