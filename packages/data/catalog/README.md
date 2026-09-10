# @phaseo/data-catalog

The database is the source of truth for Phaseo's model, provider, organisation, benchmark, pricing, alias, family, and subscription catalog.

## Report a catalog change

[Report incorrect information](https://github.com/phaseoteam/Phaseo/issues/new?template=incorrect-info.yml) or [request missing data](https://github.com/phaseoteam/Phaseo/issues/new?template=data-request.yml). Include the affected page or record ID, proposed values, and official sources. Maintainers review reports and apply approved changes through the admin-only [catalog editor](https://phaseo.app/internal/data).

## Edit and review

Admins use the editor for records, provider routes, pricing, and benchmark results. [Catalog settings](https://phaseo.app/internal/data/registries) manages families, service tiers, meters, regions, route variants, subscription plans, and plan features. [Provider updates](https://phaseo.app/internal/data/imports) queues prices for explicit acceptance or dismissal; provider feeds do not automatically publish prices.

A provider may be catalog-only. A callable model requires an explicitly enabled compatible provider route; a catalog entry alone does not enable routing. Preserve stable identities, source citations, price units, and historical effective dates when editing.

## Files and automation

- `generated/database-v2` contains daily public database snapshots and the generated OpenAPI enum index. Snapshots are limited to the `aliases`, `api_providers`, `benchmarks`, `families`, `models`, `organisations`, `pricing`, and `subscription_plans` catalog namespaces; operational, billing, analytics, history, proposal, and admin tables are not exported. Snapshot updates are reviewed through pull requests.
- `src/data` contains archived compatibility fixtures. Editing these files does not update the live catalog.
- The legacy JSON-to-database importer is retired. Neither archived fixtures nor exported snapshots are an input feed.
- Provider discovery proposes database pricing updates, benchmark sync writes reviewed-source results, and lifecycle automation uses database dates and routes.
- The historical fixture contract remains in [`schema/catalog.schema.json`](schema/catalog.schema.json). Fixture validators check structure and cross-file references; they do not publish data.

Code, schema, and automation changes still use branches, tests, and pull requests. Never edit generated SDK or OpenAPI model lists by hand; regenerate them through the snapshot tooling.
