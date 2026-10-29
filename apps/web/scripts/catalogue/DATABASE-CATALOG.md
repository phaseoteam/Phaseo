# Database catalog operations

The database is the source of truth for the catalog. Edit records at
`/internal/data`; the authenticated admin API records changes in private row history.
Settings at `/internal/data/registries` manage model families, service tiers, meter
definitions, provider regions, route variants, subscription plans and plan features.
Model editors manage plan membership, aliases, capabilities, benchmarks and prices.

There is no JSON-to-database importer, and the repository holds no catalog JSON or
exports.

## Automated updates

Provider catalog sync writes pending proposals to the private
`v2_catalogue_price_proposals` table. Review these at `/internal/data/imports`.
Acceptance checks that the source SKU has not changed and creates a new price
version through the existing audited pricing transaction. Dismissal retains the
proposal. Each new quote supersedes older pending quotes for the same price
family; a feed price matching the database clears obsolete quotes. Feed updates
and acceptance are serialized so a superseded quote cannot be published.
Ambiguous routes, conditional pricing and incomplete meter sets are
skipped for manual editing. Official pricing takes priority over live provider
prices; models.dev only fills missing prices. This feed does not create new models.
The existing provider discovery pipeline continues to supply discovery candidates.

Nightly lifecycle refresh reads database dates and active routes, preserves explicit
operational overrides, and skips concurrently edited records. Use
`pnpm data:update-statuses --dry-run` to preview transitions.

Artificial Analysis sync matches database models and writes benchmark metadata and
results directly to the database. Removed results are end-dated. Run without
`--write` to preview matches; no JSON publication step is required.

## Local demo

Start the web API on 8788 and the web app on 3100, with `WEB_API_ORIGIN` set to
`http://127.0.0.1:8788` in the web process. Both retain normal authentication and
admin authorization. The database selected by the local environment remains live:
saving is a real write, not a simulated demo action.

## Catalogue history

Catalog editors ask before discarding unsaved changes on links, editor tabs and browser Back/Forward. Reloads and tab closure use the browser's own warning. Saving or reverting a draft clears the warning; failed writes retain it. Model sections remount after confirmed navigation so discarded values cannot leak into another section's save.

The navigation provider lives outside root Suspense boundaries so it can track history before Next.js mounts. The pinned `next-navigation-guard` dependency has a small checked-in compatibility patch: reinstall link interception after Strict Mode cleanup, continue accepted links through the App Router, and intercept history events before router listeners. Its upstream Strict Mode fix is documented in [the library source](https://github.com/LayerXcom/next-navigation-guard/blob/main/src/hooks/useInterceptLinkClicks.ts). Keep the patch covered by browser checks when upgrading Next.js or the guard.

The history migration records an initial baseline of all 23 catalogue tables and
appends complete before/after rows for subsequent editor and automation writes.
`v2_catalogue_row_history` is private to the backend, rejects changes to
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

Row history is private. Preserve it through database backups.

### Regional routing

Use Providers > New regional provider, or Add regional provider from an existing provider. Choose the parent and region, then confirm the offer label, execution regions, data residency regions and API base URL. The offer shares its parent's provider family and appears with its label in model provider selectors. Attach it to models from their Providers tab.

Provider settings apply to every model on that offer and supply gateway residency filtering. Pricing > Routing & regions links to these settings and edits model availability separately; SKU regions remain pricing dimensions. Empty provider region lists use built-in gateway defaults. Registration does not configure gateway executors or credentials: new offers start with routing disabled, and editing an existing offer preserves its routing flags. Provider changes retain the previous row, new row and actor in catalogue history.
