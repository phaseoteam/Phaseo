# Supabase authoring

Read [DECLARATIVE-SCHEMAS.md](DECLARATIVE-SCHEMAS.md) for the replay baseline,
deployment boundary, and CLI requirements.

- `schemas/` is the desired database structure. Edit definitions there first.
  Keep the generated `.pgdelta-export.json` manifest alongside the SQL.
- Generate forward SQL with `pnpm db:schema:sync -- -f descriptive_change_name`.
  Review it and commit it with the matching schema definitions.
- Verify with `pnpm db:schema:check`; run relevant SQL contracts and
  `pnpm db:schema:smoke` for replay or schema changes. These commands use an
  isolated baseline plus forward migrations and require a local runtime.
- Do not use raw `db diff`, declarative `sync`, or root `db reset` for this
  repository: the original migration history lacks its initial schema.
- Keep existing migrations and `baseline/schema.sql` / `baseline/history.sha256`
  unchanged. The baseline is for empty disposable databases, never production.
  Preserve historical files and remote migration records.
- Deployment applies reviewed migrations, not schema files. Do not apply live
  schema changes through Studio, SQL tools, or MCP without explicit deployment
  authorization; those changes would also need matching committed definitions.
- Use handwritten forward migrations for data backfills and unsupported objects.
  Do not disable strict coverage to make a check pass. Catalogue records belong
  in Supabase; archived JSON fixtures are not a database input feed.
- Use `pnpm db:schema:export` only to inspect or deliberately refresh from the
  linked database. Review drift and local edits before replacing definitions.
