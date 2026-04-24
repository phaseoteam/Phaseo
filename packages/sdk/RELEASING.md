# SDK Releasing

This repo uses a hybrid release model:

- TypeScript + Python are auto-released from CI.
- Go/C#/Java/PHP/Ruby use explicit publish workflows per ecosystem.
- C++/Rust remain excluded until functional end-to-end.
- Manual SDK release readiness can be checked with `.github/workflows/sdk-publish-readiness.yml`.

## Canonical Distribution Targets

- TypeScript (`@ai-stats/sdk`) -> npm
- Python (`ai-stats-py-sdk`) -> PyPI
- Go (`github.com/AI-Stats/AI-Stats/packages/sdk/sdk-go`) -> Go proxy (`pkg.go.dev`) via git tags
- C# (`AI.Stats.Sdk`) -> NuGet
- Java (`app.phaseo:ai-stats-sdk`) -> Maven Central
- PHP (`ai-stats/php-sdk`) -> Packagist
- Ruby (`ai_stats_sdk`) -> RubyGems

## Auto Release (TS/Python)

CI workflow: `.github/workflows/ci.yml` publish job.

- `changeset:ensure-sdk-autorelease` creates an automatic patch changeset when OpenAPI/SDK surfaces change and no manual changeset is present.
- `changeset:version` now also runs:
  - `sdk-py:sync-version`
  - `sdk:sync-language-manifests`
- OpenAPI generation now runs `openapi:sync-enums` before normalize/codegen so model-id enums stay aligned to `packages/data/catalog/src/data/manifest.json`.

Version manifest sync script:

- `scripts/update-sdk-language-manifest-versions.ts`
  - C#: `packages/sdk/sdk-csharp/AIStats.Sdk.csproj`
  - Java: `packages/sdk/sdk-java/pom.xml`
  - Ruby: `packages/sdk/sdk-ruby/lib/ai_stats_sdk/version.rb`

## GitHub Release Policy

- Package publishing and package changelogs are the source of truth.
- CI now defaults to `AI_STATS_GH_RELEASE_MODE=all`.
- A per-package GitHub Release is created immediately when publish succeeds.
- Release notes are generated from package changelog sections, with grouped `Core Changes`/`Misc Changes` plus `Credits` when contributors are present.

Release mode controls:

- `off`: never create GitHub Releases from package publishes.
- `notable_only`: only major/notable releases.
- `all` (default): create per-package GitHub Releases for every publish.

## SDK Semver Guardrails

CI runs `changeset:validate-sdk-semver` as an informational guard around callable helper model IDs.

Policy:

- Catalog/discovery model changes do **not** drive SDK semver.
- Callable helper constant snapshots (`ModelIds`, `MODEL_IDS`, etc.) do **not** require `minor`/`major` bumps when they change.
- Auto-generated SDK releases for model/helper churn default to **patch**.
- Real semver signals come from actual client API changes: endpoints, request/response shapes, signatures, packaging/runtime fixes.

Model typing policy:

- Request/invocation `ModelId` is runtime `string`.
- SDK helper constants are generated from the current callable-on-gateway snapshot.
- Public catalog APIs may expose additional known models that are not yet callable.

General policy:

- `patch`: backward-compatible bugfixes, metadata fixes, packaging fixes.
- `minor`: backward-compatible feature additions (new optional params/endpoints).
- `major`: breaking changes (removed/renamed params, signature/shape breaks).

## Manual Publish Workflows (Other SDKs)

- Go: `.github/workflows/publish-sdk-go.yml`
  - Publishes by creating/pushing tag `packages/sdk/sdk-go/vX.Y.Z`

- C#: `.github/workflows/publish-sdk-csharp.yml`
  - Publishes `.nupkg` and `.snupkg` to NuGet
  - Uses NuGet trusted publishing (OIDC), no API key secret required
  - Optional repo variable: `NUGET_TRUSTED_PUBLISHING_USER` (defaults to repo owner)

- Java: `.github/workflows/publish-sdk-java.yml`
  - Builds/signs and deploys to Maven Central
  - Required secrets:
    - `MAVEN_CENTRAL_USERNAME`
    - `MAVEN_CENTRAL_PASSWORD`
    - `MAVEN_GPG_PRIVATE_KEY`
    - `MAVEN_GPG_PASSPHRASE`

- PHP: `.github/workflows/publish-sdk-php.yml`
  - Publishes by creating/pushing monorepo tag `sdk-php/vX.Y.Z`
  - Syncs `packages/sdk/sdk-php` to split repo main and pushes split tag `vX.Y.Z`
  - Triggers Packagist update against the split repo URL
  - Required secrets:
    - `PACKAGIST_USERNAME`
    - `PACKAGIST_MAIN_TOKEN`
    - `PHP_SDK_SPLIT_REPO_TOKEN`
  - Optional repo variable:
    - `PHP_SDK_SPLIT_REPO` (defaults to `AI-Stats/ai-stats-php-sdk`)

- PHP split sync automation: `.github/workflows/sync-sdk-php-split.yml`
  - Keeps split repo main in sync from monorepo path `packages/sdk/sdk-php/**` on pushes to main

- Ruby: `.github/workflows/publish-sdk-ruby.yml`
  - Builds gem, creates/pushes tag `sdk-ruby/vX.Y.Z`, pushes to RubyGems
  - Required secret: `RUBYGEMS_API_KEY`

## Publish Readiness Checks

- Run `.github/workflows/sdk-publish-readiness.yml` (workflow_dispatch) before first publish and after registry credential rotation.
- It validates package buildability for each ecosystem and checks required publish secrets when `checkSecrets=true`.
