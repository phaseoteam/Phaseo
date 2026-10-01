# Production migrations

The migration files in `migrations/` are the source of truth for production schema history. The production CI job runs `supabase db push`, which compares their timestamp versions with `supabase_migrations.schema_migrations` in production. A version already recorded there is skipped; a production version with no matching file causes the job to stop.

To apply a migration before CI, create and commit its timestamped SQL file first. From the branch containing that file, link the CLI to the production project and run `supabase db push --linked --include-all --dry-run` to review the pending versions. Then run `supabase db push --linked --include-all` using the same checkout. When CI later runs from that commit, it sees the recorded version and skips it.

Do not apply SQL through a tool that creates a new migration version unless its exact version and SQL file will also be committed. If production already contains a version absent from the repository, restore its recorded SQL under that version before pushing further migrations. Do not mark an applied migration as reverted just to clear the history error; that changes only the history record and leaves its schema changes in place.
