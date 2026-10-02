# Phaseo Web

The Next.js website, dashboard, and internal catalog editor.

## Development

From the repository root, run `pnpm install`, then `pnpm --filter @phaseo/web dev`. The local site runs at http://localhost:3100. Configure the required local environment and backend services before using authenticated features; never commit credentials.

## Catalog management

The database is the catalog source of truth. Admins use `/internal/data` to manage models, organisations, providers, routes, prices, and benchmark results. `/internal/data/registries` manages supporting catalog settings, and `/internal/data/imports` reviews provider price proposals.

Public visitors should [report incorrect information](https://github.com/phaseoteam/Phaseo/issues/new?template=incorrect-info.yml) or [request missing data](https://github.com/phaseoteam/Phaseo/issues/new?template=data-request.yml) with the affected record and official sources. Maintainers review the issue and apply approved updates in the editor.

The `Catalog Database Snapshot` workflow reads the production database and exports the eight public catalog namespaces to `packages/data/catalog/generated/database-v2`, then opens a reviewable pull request when the snapshot changes. There is no JSON import path: archived `packages/data/catalog/src/data` fixtures and generated snapshots are validation/publication artifacts only and do not update the live catalog.

## Validation

Run `pnpm --filter @phaseo/web lint`, `pnpm --filter @phaseo/web typecheck`, and the relevant tests. Run `pnpm --filter @phaseo/web build` for rendering or routing changes. Follow [AGENTS.md](AGENTS.md) and the root [contribution guide](../../CONTRIBUTING.md).

## Translation payloads

The server request configuration retains complete locale catalogs. `RootDocument` sends only the shared namespaces in `src/i18n/message-scopes.ts` to the browser. Route layouts and templates supply their feature namespaces through `ScopedMessages`, which merges them with shared copy without serializing the parent catalog again.

When adding a translated client component, include its namespace in the nearest route boundary. Use `createScopedMessagesLayout` for a layout and `createScopedMessagesTemplate` for a template; Next templates do not receive route params. Shared controls belong in the shell scope only when they are available throughout the site. Keep dictionary imports on the server.

`pnpm --filter @phaseo/web validate:i18n` checks route import graphs for uncovered static translation calls. `message-scopes.test.ts` checks all declared namespaces across every locale and nested provider inheritance. Review computed translation keys and newly shared components as well, since static checks cannot determine every runtime key. Run a production build after changing boundaries so partial prerendering is checked too.

## Server catalogue loading

The models page has one 15-second server budget covering session resolution, provider previews, catalogue pages, pricing and private data. Its signal reaches each request, including Auth requests, and server prefetch retries are disabled. Browser query policies remain independent. If the account scope is already known when the deadline expires, the browser can recover the catalogue request; an unresolved session is never silently treated as anonymous.
