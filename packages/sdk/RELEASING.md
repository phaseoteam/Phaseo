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
- OpenAPI generation now runs `openapi:sync-enums` before normalize/codegen so model-id enums stay aligned to `apps/web/src/data/manifest.json`.

Version manifest sync script:

- `scripts/update-sdk-language-manifest-versions.ts`
  - C#: `packages/sdk/sdk-csharp/AIStats.Sdk.csproj`
  - Java: `packages/sdk/sdk-java/pom.xml`
  - Ruby: `packages/sdk/sdk-ruby/lib/ai_stats_sdk/version.rb`

## GitHub Release Policy (High Signal)

- Package publishing and package changelogs are the source of truth.
- GitHub Releases are intentionally **not** created for every publish.
- CI defaults to `AI_STATS_GH_RELEASE_MODE=notable_only`:
  - Create GitHub Release when a package bump is **major**, or
  - Changelog section is explicitly marked notable (`#notable`, `[notable]`, or `notable: true`).
- Weekly rollups are handled by `.github/workflows/release-rollup.yml`.

Release mode controls:

- `off`: never create GitHub Releases from package publishes.
- `notable_only` (default): only major/notable releases.
- `all`: create per-package GitHub Releases for every publish (not recommended).

## SDK Semver Guardrails

CI runs `changeset:validate-sdk-semver` to enforce model-surface semver:

- Model IDs added to typed/autocomplete surface -> at least **minor** for functional SDKs (TS/Python/Go/C#/Java/PHP/Ruby).
- Model IDs removed from typed/autocomplete surface -> **major** for functional SDKs (TS/Python/Go/C#/Java/PHP/Ruby).

General policy:

- `patch`: backward-compatible bugfixes, metadata fixes, packaging fixes.
- `minor`: backward-compatible feature additions (new optional params/endpoints/models).
- `major`: breaking changes (removed/renamed params, removed typed model support, signature/shape breaks).

## Manual Publish Workflows (Other SDKs)

- Go: `.github/workflows/publish-sdk-go.yml`
  - Publishes by creating/pushing tag `packages/sdk/sdk-go/vX.Y.Z`

- C#: `.github/workflows/publish-sdk-csharp.yml`
  - Publishes `.nupkg` and `.snupkg` to NuGet
  - Required secret: `NUGET_API_KEY`

- Java: `.github/workflows/publish-sdk-java.yml`
  - Builds/signs and deploys to Maven Central
  - Required secrets:
    - `MAVEN_CENTRAL_USERNAME`
    - `MAVEN_CENTRAL_PASSWORD`
    - `MAVEN_GPG_PRIVATE_KEY`
    - `MAVEN_GPG_PASSPHRASE`

- PHP: `.github/workflows/publish-sdk-php.yml`
  - Publishes by creating/pushing tag `sdk-php/vX.Y.Z`
  - Triggers Packagist update
  - Required secrets:
    - `PACKAGIST_USERNAME`
    - `PACKAGIST_TOKEN`

- Ruby: `.github/workflows/publish-sdk-ruby.yml`
  - Builds gem, creates/pushes tag `sdk-ruby/vX.Y.Z`, pushes to RubyGems
  - Required secret: `RUBYGEMS_API_KEY`

## Publish Readiness Checks

- Run `.github/workflows/sdk-publish-readiness.yml` (workflow_dispatch) before first publish and after registry credential rotation.
- It validates package buildability for each ecosystem and checks required publish secrets when `checkSecrets=true`.
