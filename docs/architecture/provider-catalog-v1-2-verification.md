# Provider catalog v1.2 implementation verification

Status: Local implementation, not deployable until schema generation/replay completes.

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

## Remaining database gate

`pnpm db:schema:sync -- -f provider_catalog_v12_data_policy` failed with:

```text
docker: command not found (podman also not found) â€” install Docker Desktop or Podman and ensure it is on PATH
```

No forward migration was generated. Do not deploy these application changes against the old schema. Repository instructions require generating the migration from the desired definitions, rather than hand-writing a substitute.

Once a local runtime is available, run:

```sh
pnpm db:schema:sync -- -f provider_catalog_v12_data_policy
pnpm db:schema:check
pnpm db:schema:smoke
```

Review the generated migration, ensure the approval/audit objects, helper/view, triggers and altered promotion/pricing/gateway functions are included, and execute `provider_catalog_data_policy.sql` plus existing retention contracts. Check SQL permissions, source replacement, false/null/downgrade withdrawal, batch/stateful denial and admin-pin preservation before opening a release PR.

Production approval, provider coordination and manual-pin transfer remain separate rollout steps. A dedicated admin console, conditional-account activation and non-text ZDR grants remain outside this initial implementation.
