# Working safely against production

Production means the live Supabase database, the deployed Cloudflare Workers, the Vercel web app, the Mintlify docs, and the accounts behind them. The default is no production writes of any kind.

## Default rules

- Write to production only when the maintainer explicitly asks for that specific change. This covers database rows and schema, Worker secrets and settings, Vercel and Cloudflare configuration, and third-party dashboards.
- Run read-only diagnostics only when the maintainer asks for them. Use a read-only query mode or role when the tool offers one.
- Never restart, resize or pause the database without a fresh confirmation for that incident.
- Never print, log or commit credentials. Redact keys, tokens, emails and customer data from command output, screenshots and pull request descriptions.
- Reading public pages and public API responses is fine.

## Keep queries light

The production database runs on a small compute tier. Diagnostic queries compete with gateway traffic for the same memory and disk IO.

- Select only the columns you need, filter on indexed columns, and add a `limit`.
- Use `explain` before running anything that might scan request or usage tables.
- Run one diagnostic query at a time.
- If production is slow or hanging, check memory, swap and the disk IO budget before blaming a query.

## Aggregate in the database

Never fetch rows to sum, count or bucket them in a Worker or the browser. PostgREST returns at most 1,000 rows per request, so a larger `.limit()` silently truncates the result and the totals come out wrong.

- Put totals, counts and time series in a SQL function (`LANGUAGE sql STABLE`, `SET search_path TO ''`) and call it with `.rpc()`.
- Use `SECURITY INVOKER` with an `authenticated` grant when row-level security already scopes the rows. Use the service role only for service-only tables, behind a route that checks membership.
- For totals over long windows, read a rollup table rather than raw requests.

## Catalogue data

The Supabase catalogue is the source of truth for models, providers, pricing, aliases and benchmarks. The repository holds no catalogue JSON, so no repository check validates live catalogue data.

- Change catalogue data only when asked, with targeted operations on the affected rows. Agents use the connected Supabase tooling as the onboarding skill describes; maintainers can also use the admin catalogue editor (`/internal/data`), which writes to the same database.
- Read the rows back afterwards and include the readback in your report or pull request.

See the [model and provider onboarding skill](../../.agents/skills/phaseo-model-provider-onboarding/SKILL.md).

## Schema changes and migrations

Schema changes reach production only through a reviewed pull request and the CI migration job. Read [Production database migrations](../../.github/PRODUCTION_DATABASE_MIGRATIONS.md) and [supabase/AGENTS.md](../../supabase/AGENTS.md).

- Never apply SQL to production directly, whether through an SQL editor, an MCP tool or `psql`, even when the same file is in an open pull request.
- Give a new migration a version newer than every migration on the current `origin/main`. Never date one in the future: CI's schema smoke step generates a migration at the current time and fails if an existing one sorts after it.

### Migration history drift

SQL applied directly to production is recorded in its migration history under a wall-clock version. If `main` has no file with exactly that version, the "Apply production database migrations" job fails at its dry run with "Remote migration versions not found in local migrations directory". Every CI deploy job is then skipped, so no web, gateway, Web API or MCP change ships until the history matches. Docs still ship, because Mintlify deploys them on its own.

To fix it without writing to production:

1. Read the unknown versions from the failed job's log.
2. Search open pull requests and branches for a file with that version (`git ls-tree -r origin/<branch> -- supabase/migrations`). If one exists, merging that pull request may be the whole fix.
3. Otherwise, with the maintainer's approval, read the applied SQL with a read-only query on `supabase_migrations.schema_migrations`.
4. Commit it as `supabase/migrations/<production version>_<name>.sql`, starting with the provenance header used by earlier restores:

   ```sql
   -- Restored from Phaseo Prod migration records; already applied as version <version>.
   -- phaseo:allow-production-history-backfill reason: <specific justification>
   ```

5. Update `supabase/schemas/` for every function or table the SQL redefines, copying function bodies exactly, so the declarative check passes.

Do not run `supabase migration repair --status reverted` for a real schema change. It hides drift that the repository does not know about.

## Live API checks

- Do not create API keys, start device-code logins, or spend credit to test, unless the maintainer asks.
- Prefer AIMock tests and the provider mock; see [Development](./development.md#gateway-api).
- When a live check is needed, use the maintainer's existing `phaseo` CLI login session, for example `phaseo api get /v1/<path> --json`. Print status codes and the fields you need, never the token.
- `*.live.spec.ts` tests, `test:live:*` scripts, SDK smoke tests and AIMock recording call real providers and spend quota. Run them only when asked.
- Vercel pull request previews require a Vercel login. Do not create a protection-bypass secret to reach one. Unless the preview sets `WEB_API_ORIGIN`, `apps/web/next.config.mjs` rewrites `/api/_web`, `/api/account`, `/api/chat` and `/api/internal` on a preview to production `https://phaseo.app`. A preview therefore reads the production Web API and does not run Web API changes from the same pull request; check those on production after deploy.
