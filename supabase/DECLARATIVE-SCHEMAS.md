# Declarative schema adoption

Status: exported candidate; do not merge until equivalence and replay pass.

The files in `schemas/` were exported from Phaseo Prod
(`xansbgjaduxypzsmjwct`) on 2026-10-04 with Supabase CLI 2.119.0.
The export contains 658 SQL files and the CLI's generated export manifest.
It includes `public`, `private`, `catalogue_private`, the custom trigger on
`auth.users`, extension declarations, grants, policies, and scheduled jobs.
No application data was exported. Keep the manifest alongside the SQL files.
The export is a snapshot, not evidence that historical migrations replay.

At checkout `2a84658993c7477296c1ac4461d59044d3c732dc`, all 756 repository
migration versions matched production's recorded versions. This checks IDs
only, not SQL contents or schema equivalence. Existing migrations remain
unchanged. `sql.sql` is an old context-only snapshot and must not be used as
an executable baseline.

## Before adoption

1. Use CLI 2.119.0 for export, sync, and verification. The package scripts pin
   it independently of the existing production deployment CLI.
2. Run `pnpm db:schema:check` in an isolated checkout with Docker available.
   It rebuilds shadow state from migrations and requires strict coverage and
   zero generated migrations. It never applies generated SQL. A failure may
   leave a review migration in that checkout; inspect it before removing it.
3. Investigate missing historical baseline objects or differences reported
   by the new engine. Do not rewrite deployed history, mark remote migrations
   repaired, or push generated catch-up SQL as part of this export.
4. Replay the complete migration chain in a disposable local Supabase
   project, then run the database smoke tests. Verify wallets, authorization,
   signup triggers, grants, partitions, and RPC contracts explicitly.
5. Make a small local schema change, generate its migration, and verify its
   application. Revert the trial definitions and trial migration afterward.
6. Re-export if production changes during review, then repeat the checks.

Export was verified to complete on Windows without Docker using 2.119.0.
Sync still requires a shadow Postgres runtime; this machine lacks Docker.
The isolated GitHub workflow runs the comparison without production secrets.
Do not equate a successful export with a completed transition.

## After adoption

Edit the desired definitions in `schemas/`, then run
`pnpm db:schema:sync -- -f descriptive_change_name`. Review the generated
incremental migrations and test locally before opening a PR. Commit both
the definitions and migration. Deployment continues through the existing
migration pipeline; schema files are not applied directly to production.

Avoid schema edits through production Studio or the SQL editor: sync compares
the files with migration history, not with the live database. Use exports to
inspect drift, not to replace locally edited definitions without review.

Keep data backfills, storage bucket records, and unsupported objects in
forward migrations. Review cron jobs and extension-managed objects through
their supported APIs. `--strict-coverage` failures must be investigated;
do not silently disable coverage to obtain a green check.

See the [declarative schema guide](https://supabase.com/docs/guides/local-development/declarative-database-schemas)
and [diff engine migration guide](https://supabase.com/docs/guides/local-development/diff-engines).
