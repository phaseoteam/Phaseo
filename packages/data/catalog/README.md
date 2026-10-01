# @phaseo/data-catalog

The database is the source of truth for Phaseo's model, provider, organisation, benchmark, pricing, alias, family, and subscription catalog.

## Report a catalog change

[Report incorrect information](https://github.com/phaseoteam/Phaseo/issues/new?template=incorrect-info.yml) or [request missing data](https://github.com/phaseoteam/Phaseo/issues/new?template=data-request.yml). Include the affected page or record ID, proposed values, and official sources. Maintainers review reports and apply approved changes through the admin-only [catalog editor](https://phaseo.app/internal/data).

## Edit and review

Admins use the editor for records, provider routes, pricing, and benchmark results. [Catalog settings](https://phaseo.app/internal/data/registries) manages families, service tiers, meters, regions, route variants, subscription plans, and plan features. [Provider updates](https://phaseo.app/internal/data/imports) queues prices for explicit acceptance or dismissal; provider feeds do not automatically publish prices.

A provider may be catalog-only. A callable model requires an explicitly enabled compatible provider route; a catalog entry alone does not enable routing. Preserve stable identities, source citations, price units, and historical effective dates when editing.

## Files and automation

- The admin editor writes the production v2 catalog database. There is no JSON-to-database import step; changes to catalog records must be made through `/internal/data` or an approved database automation.
- `generated/database-v2` contains daily public database snapshots and the generated OpenAPI enum index. Snapshots are limited to the `aliases`, `api_providers`, `benchmarks`, `families`, `models`, `organisations`, `pricing`, and `subscription_plans` catalog namespaces; operational, billing, analytics, history, proposal, and admin tables are not exported. The `Catalog Database Snapshot` workflow reads the database, writes this directory, and opens a reviewable pull request when the public snapshot changes.
- `src/data` contains archived compatibility fixtures used by validators and contract tests. Editing these files or generated snapshots does not update the live catalog.
- Provider discovery proposes database pricing updates, benchmark sync writes reviewed-source results, and lifecycle automation uses database dates and routes. None of these jobs imports repository JSON into the database.
- The historical fixture contract remains in [`schema/catalog.schema.json`](schema/catalog.schema.json). Fixture validators check structure and cross-file references; they do not publish data.

Code, schema, and automation changes still use branches, tests, and pull requests. Never edit generated SDK or OpenAPI model lists by hand; regenerate them through the snapshot tooling.
