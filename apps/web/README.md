# Phaseo Web

The Next.js website, dashboard, and internal catalog editor.

## Development

From the repository root, run `pnpm install`, then `pnpm --filter @phaseo/web dev`. The local site runs at http://localhost:3100. Configure the required local environment and backend services before using authenticated features; never commit credentials.

## Catalog management

The database is the catalog source of truth. Admins use `/internal/data` to manage models, organisations, providers, routes, prices, and benchmark results. `/internal/data/registries` manages supporting catalog settings, and `/internal/data/imports` reviews provider price proposals.

Public visitors should [report incorrect information](https://github.com/phaseoteam/Phaseo/issues/new?template=incorrect-info.yml) or [request missing data](https://github.com/phaseoteam/Phaseo/issues/new?template=data-request.yml) with the affected record and official sources. Maintainers review the issue and apply approved updates in the editor.

Daily public snapshots are exported to `packages/data/catalog/generated/database-v2`. The legacy JSON importer is retired, and edits to archived `src/data` fixtures do not update the live catalog.

## Validation

Run `pnpm --filter @phaseo/web lint`, `pnpm --filter @phaseo/web typecheck`, and the relevant tests. Run `pnpm --filter @phaseo/web build` for rendering or routing changes. Follow [AGENTS.md](AGENTS.md) and the root [contribution guide](../../CONTRIBUTING.md).
