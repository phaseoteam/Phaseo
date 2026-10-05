# Declarative schemas

Database definitions live in `schemas/`. Deployment still uses forward SQL
files in `migrations/`; schema files are never applied directly to production.

## Replay baseline

The deployed history omits the original application schema. Empty-database
replay fails at `20260120000001_provisioning_keys_table.sql` because
`public.users` is missing. The context-only `sql.sql` snapshot is not executable.

`baseline/schema.sql` provides a complete starting point for isolated replay.
It was generated with Supabase CLI 2.119.0 from the 2026-10-04 production schema
export, in [CI run 37237888760](https://github.com/phaseoteam/Phaseo/actions/runs/37237888760).
It includes private objects, permissions, policies, the auth signup trigger,
extensions, partitions, and scheduled jobs. It contains no application rows.

`baseline/history.sha256` identifies all 756 deployed migrations represented
by that snapshot, through version `20261003130000`. Hashes normalize CRLF to
LF. Tooling rejects changed/missing historical files and newly added migrations
that predate the cutoff. Preserve the baseline and historical files unchanged.

The baseline is **for empty disposable databases only**. It is outside the
production migration directory. Do not deploy it, run it against production,
or repair remote migration records. All original migrations remain in place
for existing environments and audit history. Production migration records
need no changes for this workflow.

## Daily workflow

1. Edit the desired definitions in `schemas/`.
2. Run `pnpm db:schema:sync -- -f descriptive_change_name`.
3. Review the generated forward migration and test it locally.
4. Commit the definitions and migration together, then open a PR.

`pnpm db:schema:check` prepares a temporary Supabase project with the frozen
baseline and migrations newer than its cutoff. It invokes strict coverage
with CLI 2.119.0 and fails if any schema difference generates a migration.
`db:schema:sync` uses the same replay history and copies only newly generated
migrations back into the deployment directory. Neither command connects to
production or applies generated SQL. Failed comparisons retain their temporary
directory for inspection.

Both commands need a shadow Postgres runtime, such as Docker on Windows.
`pnpm db:schema:smoke` replays the baseline and forward migrations, runs SQL
contract tests, then generates and applies a trial incremental migration in
the disposable database. CI runs this after the equivalence check.
CI runs without production credentials. Raw `supabase db schema declarative
sync` and raw `db reset` against the repository root still encounter the
incomplete historical chain; use the replay tooling instead.

Exports use `pnpm db:schema:export` against the linked database. Review drift
before replacing locally edited definitions. Keep `.pgdelta-export.json`, the
CLI-generated load-order manifest, alongside the SQL files.

## Chat URL drift

The later production migration `20261004221046_canonical_routing_capabilities`
was restored from production's recorded SQL with its existing version.
Its two functions and nine tables' constraints/triggers are represented in
the desired definitions and tested during replay. Production already records
this version, so it must not be replayed or assigned a new deployment version.

The earlier repository migration `20261004220029_canonical_routing_capabilities`
contains identical SQL. Disposable replay verifies that equivalence and replaces
only its temporary copy with a no-op, applying the recorded `20261004221046`
version once. A mismatch stops replay for review. Neither historical file nor
production migration records are changed.

Production's chat attribution function retained a legacy URL despite historical
repository definitions using `phaseo.app`. The forward migration
`20261004215447_canonical_chat_app_identity.sql` changes future attribution to
`https://phaseo.app/chat`, preserving function privileges. It does not backfill
existing app rows. The frozen baseline retains the old value and is excluded
from the active-domain scan; desired definitions and forward migrations are checked.

## Boundaries

Data backfills, storage bucket records, and unsupported objects require forward
migrations. Investigate strict-coverage failures rather than disabling coverage.
Schema equivalence verifies structure and permissions, not application data or
every runtime behavior; run relevant SQL smoke tests for functional changes.

The production deployment pipeline is unchanged. The replay baseline does not
replace production history or authorize applying migrations or merging this PR.

See the [declarative schema guide](https://supabase.com/docs/guides/local-development/declarative-database-schemas)
and [diff engines](https://supabase.com/docs/guides/local-development/diff-engines).
