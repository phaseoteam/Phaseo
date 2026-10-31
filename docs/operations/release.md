# Releases and deploys

How a change gets from a branch to users. The root `AGENTS.md` has the short version for changesets; this page has the full mechanics. Per-language SDK publishing details are in [packages/sdk/RELEASING.md](../../packages/sdk/RELEASING.md).

## Merge a pull request

- Branch from `origin/main` with a name that has never been merged. Never commit to `main`.
- `main` accepts squash merges only. The squash commit takes the pull request title, and the branch is deleted after merging.
- Merging needs every required check to pass and every review thread to be resolved. No approving review is required, so green CI with an open thread still blocks the merge. Fix the finding or confirm with the reviewer that it is outdated, then resolve the thread.
- Required checks: OpenAPI lint; Apps api, docs and web; API AIMock matrix; Devtools build; Generate SDKs for ts, py, go, csharp, php and ruby; Build & test SDK packages; CLI package; SDK lifecycle tests for go, csharp, java, php and ruby; and Socket Security. The web app no longer builds Vercel previews; check web changes locally with `pnpm --filter @phaseo/web preview`.
- Never enable auto-merge unless the maintainer has approved it for that pull request. The repository allows it, so nothing else stops it.
- If the pull request adds a migration, check before merging that its version is newer than every migration on the current `origin/main`. The policy check only sees `main` as it was when the check ran, and branches do not have to be up to date to merge.

## What happens on `main`

Every push to `main` runs [CI](../../.github/workflows/ci.yml) again. Production releases share one concurrency group, so they never overlap.

1. **Database.** "Validate database migration policy" runs, then "Apply production database migrations" in the protected `production-database` environment: a dry run, `supabase db push`, then the security smoke SQL. See [Production database migrations](../../.github/PRODUCTION_DATABASE_MIGRATIONS.md).
2. **Deploy.** The `deploy` matrix starts once the Apps and `check-paths` jobs succeed and the migration job has either succeeded or, when production migrations are switched off (`ENABLE_PRODUCTION_DB_MIGRATIONS`) and no migration changed, been skipped:
   - `deploy (api, Deploy API)`, `(api-eu, …)` and `(api-us, …)` deploy the gateway Workers with `apps/api/scripts/deploy-global.ps1` and `deploy-regional.ps1`.
   - `deploy (web-api, …)`, `deploy (mcp, …)` and `deploy (slack, …)` deploy the Web API, MCP and Slack agent Workers.
   - `deploy (web, Deploy Web)` builds the web app and deploys the `phaseo-web` Worker with `wrangler deploy`, recording the commit as the deployment message. It skips the deploy when nothing the web build reads has changed since the commit the Worker serves. Until the `phaseo.app` route in `apps/web/wrangler.jsonc` is enabled, this deploy reaches workers.dev only.
   - Mintlify's GitHub app deploys `apps/docs` on its own; the `deploy (docs, …)` job only logs.
3. **Packages.** "Handle Versions" runs the changesets flow below.

A failed migration job blocks every CI deploy. To recover a missed or failed release, run CI on `main` manually with `deploy_production` set. If the job fails at its dry run with unknown remote versions, see [migration history drift](./production-access.md#migration-history-drift).

## Confirm a change is live

- **Workers:** wait for the matching `deploy (…)` job, then request the changed endpoint on the live host, for example `https://api.phaseo.app/v1/…`.
- **Web:** wait for `deploy (web, Deploy Web)`, then load the page on `https://phaseo.app`. Non-default locales have a prefix, such as `/de-DE/`.
- **Docs:** wait for the `Mintlify Deployment` check on the merge commit, then load `https://phaseo.app/docs/v1/…` (translations under `/docs/<locale>/v1/…`). Add a cache-busting query such as `?cb=1`.
- **Database:** the migration job log lists the versions it applied. Read the new objects back only if the maintainer approves a read-only query.

## Changesets

Add a changeset when a change should version a published package, the API, or the web app:

```sh
pnpm changeset
```

Choose the packages and the bump, then commit the generated `.changeset/*.md` file with your change.

- `patch`: compatible fixes, metadata and packaging fixes.
- `minor`: compatible additions, such as new optional parameters or endpoints.
- `major`: breaking changes. The pre-1.0 Rust crates use `minor` for breaking changes instead.
- `pnpm changeset status` shows what is queued. `pnpm changeset --empty` records a note without a version bump.
- Model ID helper constants changing is not a semver signal; real signals are endpoint, request, response and signature changes.

[.changeset/config.json](../../.changeset/config.json) ignores `phaseo`, `@phaseo/devtools` and `@phaseo/devtools-core`. Private packages get version bumps but no tags. The native-language SDKs use private `package.json` files to carry their versions.

Do not run `pnpm changeset:version` or publish from your machine. CI does both, with trusted publishing.

## How packages are published

The "Handle Versions" job runs on every push to `main`, after SDK generation, package builds, lifecycle tests, Agent SDK tests and the Apps jobs pass.

1. `changeset:ensure-sdk-autorelease` adds a patch changeset for the seven core SDKs (`@phaseo/sdk`, `py-sdk`, `go-sdk`, `csharp-sdk`, `java-sdk`, `php-sdk` and `ruby-sdk`) when their generated or entry-point sources changed without one. The Agent SDKs and the C++ and Rust SDKs need a changeset by hand when they should release.
2. `changeset:validate-sdk-semver` checks the SDK semver policy.
3. `changesets/action` opens or updates the "Version Packages" pull request on `changeset-release/main`. It runs `pnpm run changeset:version`: `changeset version`, then `sdk-py:sync-version` for `pyproject.toml` and `sdk:sync-language-manifests` for the C#, Java and Ruby manifests.
4. Merging that pull request releases. `pnpm run changeset:publish` publishes the npm packages. The job then publishes `@phaseo/cli`, `@phaseo/sdk`, `@phaseo/agent-sdk` and the Python SDK when their committed versions are missing from npm or PyPI, and `release-from-changelogs` creates a GitHub release per published package.
5. The version bumps in `packages/sdk/sdk-<language>/package.json` trigger the Go, C#, Java, PHP, Ruby and Rust publish workflows, which also publish the C#, Java and Rust Agent SDKs. The Python, Go, PHP and Ruby Agent SDKs publish through `publish-agent-sdks.yml`. Each workflow supports manual dispatch for recovery. C++ is not published.

Before the first publish to a registry, or after rotating registry credentials, run the "SDK Publish Readiness" workflow. To publish only the committed CLI version, run CI on `main` manually with `publish_cli` set.

Pre-release lines use `pnpm changeset pre enter <tag>` and `pnpm changeset pre exit`. Keep `.changeset/pre.json` committed while a pre-release is open; none is open now.

## OpenAPI and generated SDKs

[apps/docs/openapi/v1/openapi.yaml](../../apps/docs/openapi/v1/openapi.yaml) is the single contract for the docs and all nine SDKs.

- After editing it, run `pnpm openapi:gen` and commit the generated directories. While iterating, `pnpm openapi:gen:<language>` regenerates one SDK. The "Generate SDKs" jobs fail when committed output differs.
- The model, organisation and benchmark enums (`KnownModelId`, `OrganisationId`, `BenchmarkId`) are edited by hand in the spec; nothing syncs them from the database. After changing `KnownModelId`, run `node scripts/sdk/generate-model-id-constants.mjs` to refresh the SDK model-ID helpers.
- New or changed `description`, `summary` or `title` strings need entries in `apps/docs/openapi/localized-copy.json` and regenerated locale specs (`pnpm --filter @phaseo/docs openapi:locales`). See [apps/docs/TRANSLATION_WORKFLOW.md](../../apps/docs/TRANSLATION_WORKFLOW.md).
- Update the affected guides, examples and SDK reference pages in the same pull request. Never hand-edit generated SDK code; fix the spec or the generator and regenerate.
- Add a changeset for the SDK packages, or let CI add the automatic patch one.
