# Production database migrations

Database migrations are validated on pull requests without production secrets. After a migration reaches `main`, the CI workflow pauses at the protected `production-database` environment before it can inspect or update production.

CI-managed application deployment waits for the migration job. If migration validation, approval, dry-run, or application fails, the application deploy is skipped.

To recover a missed or failed release, dispatch CI on `main` with `deploy_production=true`. This validates the committed migration history, then runs the same approval-gated migration dry run, application, and security checks before deploying. It requires `ENABLE_PRODUCTION_DB_MIGRATIONS=true`; a skipped or failed migration job blocks manual deployment. Manual and push-triggered production releases share a concurrency lock, so recovery cannot overlap another production release.

Catalog publication is separate from production migration recovery. The database
snapshot workflow reads the live catalog and opens a reviewable export pull
request; production migration dispatches do not import repository JSON.

## One-time GitHub setup

Complete these steps before setting the opt-in variable:

1. In **Settings → Environments**, create `production-database`.
2. Add at least one required reviewer. Enable **Prevent self-review** if another maintainer is available.
3. Restrict deployment branches to `main`.
4. Add these environment secrets:
   - `SUPABASE_ACCESS_TOKEN`: a Supabase access token with access to the production organization.
   - `SUPABASE_DB_PASSWORD`: the production database password.
   - `SUPABASE_PROJECT_ID`: the production Supabase project reference.
5. Verify that Vercel and Cloudflare production deploys do not also run directly from a platform-side Git integration. Any independent deploy bypasses this workflow gate.
6. After the protection rules, secrets, and deploy path are verified, add the repository variable `ENABLE_PRODUCTION_DB_MIGRATIONS=true`.

The workflow is intentionally fail-closed. When a merge changes migration infrastructure and the opt-in variable is absent, production application deployment is held instead of bypassing the database step.

## What happens

For a pull request or merge-queue check that changes `supabase/migrations/**`, CI:

- rejects edits, deletions, or renames of existing migration files;
- requires timestamped lower-snake-case names and prevents new version collisions; and
- requires an explicit justification comment for destructive SQL.

For a push to `main` or an explicit manual production release on `main`, CI validates migration history, waits for approval, links the production project, runs `supabase db push --dry-run`, then applies `supabase db push`. After applying, it runs the rollback-only SQL security checks in `supabase/tests/stealth_catalogue_security_smoke.sql`. These verify the stealth identifier constraint, direct-table RLS boundary, RPC grants, and `SECURITY DEFINER` wrappers against the linked database. Production credentials exist only in the approval-gated job. If either the migration or its security checks fail, CI-managed application deployment remains blocked.

## Existing history limitation

The repository's historical migration folder is not currently a complete bootstrap: early migrations depend on production-baseline tables such as `public.users` and `public.teams`. This initial workflow therefore enforces migration policy on pull requests and validates against the linked production history after approval. A separate baseline repair is required before clean-database replay can become a required PR check.

## Authoring rules

Prefer expand-and-contract migrations:

1. Add compatible schema or RPC changes.
2. Deploy application code that works with both old and new shapes.
3. Backfill outside a request path when needed.
4. Remove obsolete schema in a later migration after usage has stopped.

Never rewrite a migration that may already have run. Add a new migration.

When destructive SQL is genuinely required, add a specific justification near the top of the new migration:

```sql
-- phaseo:allow-destructive-migration reason: legacy_table was replaced two releases ago
```

That marker makes the operation reviewable; it is not a substitute for a backup, an expand-and-contract rollout, or a tested recovery plan.

## Rollback

Database migrations are forward-only. If a production migration fails, application deployment stays blocked. Fix it with a new corrective migration, re-run CI, and approve the environment again. Restore from a database backup only for an incident where a forward repair is unsafe.

The migration workflow runs on GitHub Actions and does not consume Cloudflare Workers CPU. Only the existing application deployment jobs affect Workers.
