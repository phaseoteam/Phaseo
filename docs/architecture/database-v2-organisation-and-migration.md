# Database V2 organisation and migration plan

## Decision and scope

Database V2 is the established, additive organisation for the model catalogue,
routing control plane, pricing and credits, request facts, and derived usage
analytics. It is **not** a proposal to create a second Postgres database or to
rename every Phaseo relation. The current implementation uses the `public`
schema and the `v2_` prefix for these new authoritative relations; existing
account, authentication, workspace, and operational gateway relations remain
in their own domains unless a specific migration proves otherwise.

This document is the cross-domain migration plan. It complements the detailed
[V2 data model](v2-data-model.md), the [catalogue coverage analysis](v2-catalogue-gap-analysis.md),
the gateway observability audit in `apps/api/docs/`, and the provider-adapter
control-plane design in `apps/api/docs/`. Those documents describe individual
domains; none is the ownership, consumer, compatibility, and retirement plan
for the organisation as a whole.

## Current state

### What is authoritative today

The repository contains 459 chronological SQL files in `supabase/migrations/`.
That immutable, flat history is the deployment mechanism, not the architecture
index. The V2 foundation is additive and is now made up of four connected
domains:

| Domain | Authoritative V2 relations and contracts | Current owner |
| --- | --- | --- |
| Catalogue and routing | `v2_labs`, `v2_models`, `v2_providers`, `v2_model_aliases`, `v2_model_provider_routes`, regions, service tiers, variants, capabilities, and `get_v2_*` catalogue/routing functions | Repository catalogue data plus the importer; gateway routing reads the published projection |
| Pricing and credits | `v2_pricing_skus`, `v2_pricing_sku_meters`, `v2_meter_definitions`, `v2_credit_ledger`, and `v2_credit_reservations` | Catalogue/pricing tooling and billing workflows |
| Request facts and execution | `gateway_requests` as the authoritative request record, extended by `v2_request_facts`, attempts, artifacts, usage, pricing lines, feedback, routing decisions, and the analytics outbox | Gateway audit and lifecycle code |
| Analytics and public projections | private/public daily usage, hourly usage, provider-health projections, benchmarks, subscriptions, and V2 public RPCs | Rollup/refresh jobs and read-only API contracts |

The provider-adapter control plane is a fifth, deliberately service-only V2
subdomain: primitives, endpoints, capability adapters, constraints, evidence,
releases, and immutable execution plans. Its migrations enable RLS and revoke
`anon` and `authenticated` access. Runtime code may use published plans, but
must never execute draft configuration or store credentials in the control
plane.

`gateway_requests` is intentionally not a V1 retirement candidate. It is the
operational source of truth that V2 request facts extend. This distinction
prevents a catalogue/analytics migration from accidentally changing billing,
request identity, async finalisation, realtime, or I/O-log retention.

### Boundaries that are already visible in code

- `apps/api` owns gateway execution, request persistence, routing context,
  pricing loading, and control-plane read paths. Its `pipeline/before/context.sql`,
  audit pipeline, control routes, scheduled jobs, and pricing/model-discovery
  tools call V2 tables or RPCs.
- `apps/web-api` owns the server-facing catalogue and account contracts. The
  account model routes use V2 subscription and audited admin-catalogue RPCs;
  public model, pricing, provider, ranking, and usage routes use V2
  projections.
- `apps/web` is a presentation and import surface. Its model fetcher SQL and
  importer scripts consume or refresh V2 projections; the catalogue remains
  repository/JSON authored rather than hand-edited through page code.
- Scheduled and operator work lives in the gateway/web scripts and
  `scripts/model-discovery/run.ts`; it uses an admin client and must be treated
  as a first-class migration consumer, not as an implementation detail.
- TypeScript and Python SDKs do not contain direct Supabase/V2 callers. Their
  dependency is the HTTP/OpenAPI contract, so a database change affecting an
  SDK must be surfaced through API contract or behavioural tests rather than a
  database client migration.

### Pain points and risks

1. A large, flat migration history obscures domain ownership and the status of
   a relation. Migration filenames are chronological, so they cannot serve as
   the discoverable map of the current schema.
2. V2 was intentionally additive. During cutover that produces two names and
   two shapes for the same business concept, plus V2 compatibility projections.
   A caller can silently retain the old shape unless the dependency is searched
   and tested before a retirement step.
3. The catalogue, routing, usage, and request domains have different sources
   of truth and different retention/security requirements. Treating all
   `v2_*` tables as interchangeable invites unsafe joins, public grants, or
   destructive cleanup.
4. Some V2 work has already progressed beyond planning. In particular,
   `20260811104918_internalize_v2_compatibility_sources.sql` moved legacy-shape
   projections into the service-only `private` schema, and the following
   cleanup migrations retire verified archived rollups. Any further plan must
   preserve that forward-only state rather than reintroducing public
   compatibility views.

## Target organisation

### Ownership model

Each V2 change must name one primary domain owner and one authoritative source:

| Boundary | Source of truth | Allowed downstream use |
| --- | --- | --- |
| Catalogue identity, provider metadata, routes, tiers, capabilities, and price cards | Versioned repository catalogue data, imported into V2 | Gateway routing, public catalogue APIs, web display, and operator tooling read V2 projections |
| Provider adapter configuration | Reviewed, immutable control-plane release and compiled execution plan | Gateway uses published plans only; no browser or SDK database access |
| Request/billing lifecycle | `gateway_requests` plus the V2 request extension and ledger/reservation records | Dashboards and rollups read projections; they do not replace request lifecycle ownership |
| Analytics | V2 fact tables and refresh state/outbox at an explicit grain | Public/private RPCs and web views read derived aggregates only |
| Compatibility | A bounded service-only adapter for a named remaining caller | It has an owner, test, removal condition, and expiry; it is never a new public Data API surface |

New V2 tables are not a place to store arbitrary application state. A proposal
that does not fit one of these boundaries must first establish its own domain
and source of truth. Conversely, moving a table solely to gain the `v2_`
prefix is not a migration objective.

### Naming and contract rules

- Use `v2_<domain>_<plural-noun>` for authoritative V2 relations, following
  the existing plural-table convention. Join/projection names describe their
  grain, for example `v2_model_provider_routes` and
  `v2_public_usage_daily`.
- Use stable slug keys where identity is externally meaningful (`model_slug`,
  `provider_slug`, `service_tier_slug`); otherwise use explicit
  `<entity>_id` keys and foreign keys. Keep a provider-route key distinct from
  a canonical model identity.
- Use `get_v2_<purpose>` for stable read contracts and keep complex joins in
  SQL-owned functions/projections rather than duplicating them across the
  gateway and web applications. A public contract must expose only the fields
  and role grants it needs.
- Put transitional legacy-shape projections in `private` with explicit
  service-role grants. Do not add public compatibility views as a convenience
  layer. A public function may adapt a V2 contract only when its permission
  model and output are deliberately reviewed.
- Keep new migration files in the existing chronological directory using
  `YYYYMMDDHHMMSS_lower_snake_case.sql`. Existing migrations are immutable;
  corrections are new forward migrations, never edits, renames, or a directory
  reorganisation.
- Each change documents its domain owner, source relation, consumers,
  backfill/replay behaviour, RLS/grants, indexes, and retirement condition in
  the PR and in the closest domain document. This architecture document is the
  index; it is not a second migration ledger.

## Migration playbook

Apply the following sequence per bounded domain, not as one repository-wide
cutover.

1. **Discover and freeze the contract.** Inventory tables, views, functions,
   triggers, grants, application SQL, scripts, jobs, and HTTP consumers for
   the domain. Record the authoritative old relation, target V2 relation, row
   grain, and acceptance comparison before writing destructive SQL.
2. **Add the V2 shape safely.** Add tables, constraints, indexes, RLS, and
   service-only grants in a new migration. Write to a new V2 relation first;
   avoid a direct rename or a `CASCADE` drop. For control-plane data, also
   ensure only reviewed immutable releases can become runtime input.
3. **Backfill and prove parity.** Backfill idempotently, record unresolved
   rows explicitly (as the catalogue backfill does), and compare counts,
   identity coverage, pricing/ledger totals, and domain-specific invariants.
   Reprocess a bounded overlap for late request events and make retry behaviour
   idempotent.
4. **Move writers, then readers.** Dual-write only for the measured shadow
   period. Move one writer/worker/API contract at a time, then move readers to
   the V2 projection. Keep temporary adapters private and enumerate every
   caller. The completed caller migration recorded in PR #1614 is the model:
   application callers moved before public legacy-shape views were removed.
5. **Cut over with an operational rollback.** Promote the V2 reader/writer
   behind the existing deployment/configuration controls where applicable.
   If parity or latency regresses, route the application back to the proven
   read/write path or published control-plane release; do not attempt to
   reverse an already-applied production migration by editing history.
6. **Retire only with database proof.** Before a destructive step, run a
   preflight that checks dependencies, unresolved backfill records, and the
   relevant parity counts. The existing catalogue preflight is the precedent:
   it blocks removal until legacy/V2 route, benchmark, and request-fact checks
   pass. Destructive migrations must be explicit, narrowly scoped, and avoid
   `CASCADE` so unexpected dependencies abort the operation.
7. **Remove the adapter and record the result.** Remove dual writes, private
   compatibility views/functions, stale indexes, and obsolete rollups only
   after the removal gate has passed. Update the V2 domain documentation and
   consumer inventory in the same PR.

### Rollback and compatibility policy

Migrations are forward-only. The safe rollback is therefore operational:
switch consumers to the last verified contract, replay/backfill the V2 target
as needed, and publish the last known-good control-plane release. It is not a
blind `down` migration or a re-creation of dropped public views.

Compatibility is permitted only while all of the following are true:

- a named caller still needs a legacy shape;
- the adapter is private/service-only unless a reviewed public API contract
  requires otherwise;
- the source and target have a parity check and an owner; and
- the adapter has a concrete removal gate.

The policy deliberately excludes `gateway_requests` from generic V1/V2
retirement. Its V2 extension can evolve independently while the request record
continues to support billing and asynchronous gateway workflows.

## Validation gates

Every V2 migration PR should run the smallest relevant subset plus the
following database gates:

- `node scripts/validate-supabase-migrations.mjs <base-sha>` to enforce
  timestamped immutable migration history and documented destructive actions;
- the CI unique-version check, and local Supabase migration/list or clean
  replay checks when the change is safe to exercise locally;
- domain parity queries before and after a cutover (including dependency,
  count, and financial/usage comparisons where applicable);
- focused gateway, web-api, importer, or job tests for every moved caller;
- `pnpm validate:data`, `pnpm validate:pricing`, and `pnpm validate:gateway`
  when catalogue/routing/pricing data or their callers change; and
- a security review of RLS, role grants, `security_invoker` views, and
  `SECURITY DEFINER` functions whenever the relation is exposed or privileged.

For this documentation-only change, the appropriate verification is the
repository documentation link check and `git diff --check`; it deliberately
does not invent a schema migration or claim a production replay.

## Independently deliverable follow-ups

1. **Publish a generated database ownership inventory.** Build a checked-in
   or generated map from current relations/functions to the five boundaries
   above, with direct application/script callers. Scope it to discovery and
   documentation first; do not change runtime schema.
2. **Finish private compatibility retirement.** Inventory the service-only
   `private.v2_rpc_*_compat` views introduced by the cleanup migration, move
   each remaining database function to canonical V2 relations, add a per-view
   removal preflight, then remove the views in small reviewed batches.
3. **Prove request-extension and financial parity continuously.** Add a
   bounded, idempotent reconciliation job and alerting for request-fact,
   attempt, usage-meter, pricing-line, and ledger totals. This is observability
   work; it must not replace `gateway_requests` as the operational record.
4. **Pilot one provider/capability through the V2 adapter release lifecycle.**
   Compile a single published plan, shadow it against the existing executor,
   run fixture and live synthetic tests, and demonstrate a release-pointer
   rollback before expanding the control-plane cutover.
5. **Standardise retirement preflights.** Extract the catalogue cutover
   pattern into a reusable checklist/query template for usage, pricing, and
   control-plane retirements: dependency scan, parity criteria, grants/RLS
   review, non-`CASCADE` destructive migration, and post-cutover adapter
   removal.
