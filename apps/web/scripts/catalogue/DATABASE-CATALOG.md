# Database catalog operations

Edit records at `/internal/data`. The authenticated admin API writes model,
provider, pricing, organisation and benchmark changes to the database. Existing
source-override records protect database-managed data from legacy JSON imports.
The JSON source files still serve legacy import and bootstrap tooling; generated
snapshots are records of database state and must not be edited as an input feed.

## Daily record

`Catalog Database Snapshot` is scheduled for 00:00 UTC. GitHub Actions may start
scheduled jobs late. The schedule becomes active when its workflow is on the
default branch. It can also be run manually with `workflow_dispatch`.

Each successful run retains a separate artifact for 90 days and opens or updates
a reviewable snapshot pull request. Nothing is automatically merged. Repository
history retains snapshots that are merged; download artifacts if longer retention
is needed for unmerged daily records.

Run the read-only database export from `apps/web`:

```sh
pnpm catalog:export:database
```

It writes 23 tables to `packages/data/catalog/generated/database-v2`, using the
existing Supabase URL and service-role environment variables. It fetches all
tables before replacing files, includes rows with null timestamps, uses stable
ordering, and excludes stealth records and the override actor's user ID.

The export reads paginated tables over multiple requests. It is a catalog record,
not a transactionally consistent database backup. Use database backups for
point-in-time recovery or a restore that must preserve concurrent-write consistency.

## Local demo

Start the web API on 8788 and the web app on 3100, with `WEB_API_ORIGIN` set to
`http://127.0.0.1:8788` in the web process. Both retain normal authentication and
admin authorization. The database selected by the local environment remains live:
saving is a real write, not a simulated demo action.

## Catalogue history

Catalog editors ask before discarding unsaved changes on links, editor tabs and browser Back/Forward. Reloads and tab closure use the browser's own warning. Saving or reverting a draft clears the warning; failed writes retain it. Model sections remount after confirmed navigation so discarded values cannot leak into another section's save.

The navigation provider lives outside root Suspense boundaries so it can track history before Next.js mounts. The pinned `next-navigation-guard` dependency has a small checked-in compatibility patch: reinstall link interception after Strict Mode cleanup, continue accepted links through the App Router, and intercept history events before router listeners. Its upstream Strict Mode fix is documented in [the library source](https://github.com/LayerXcom/next-navigation-guard/blob/main/src/hooks/useInterceptLinkClicks.ts). Keep the patch covered by browser checks when upgrading Next.js or the guard.

The history migration records an initial baseline of all 23 catalogue tables and
appends complete before/after rows for subsequent writes, including importer
writes. `v2_catalogue_row_history` is private to the backend, rejects changes to
existing events, and records actor, transaction and timestamp information. Legacy
admin events remain available. History begins at the baseline; previously unaudited
changes cannot be reconstructed from the current database.

Saved prices are revised by creating a new SKU version and ending the previous
version at the new start time in one transaction. Existing meters stay attached to
the old SKU. End-dating uses a separate admin endpoint. Provider routes,
capabilities, aliases, benchmark results and plan membership are retained when
omitted from a form; ending support requires an explicit end date. Public benchmark
and plan reads exclude ended records. Core catalogue deletion is blocked in the
database and the editor.

The database regression suite uses isolated PostgreSQL through PGlite, without
credentials or a connection to the live project:

```sh
pnpm test:catalogue-history
```

The daily JSON snapshot remains a public catalogue record. It intentionally does
not export the private row history or admin actor details. Preserve that history
through database backups.

### Regional routing

Use Providers > New regional provider, or Add regional provider from an existing provider. Choose the parent and region, then confirm the offer label, execution regions, data residency regions and API base URL. The offer shares its parent's provider family and appears with its label in model provider selectors. Attach it to models from their Providers tab.

Provider settings apply to every model on that offer and supply gateway residency filtering. Pricing > Routing & regions links to these settings and edits model availability separately; SKU regions remain pricing dimensions. Empty provider region lists use built-in gateway defaults. Registration does not configure gateway executors or credentials: new offers start with routing disabled, and editing an existing offer preserves its routing flags. Provider changes retain the previous row, new row and actor in catalogue history.
