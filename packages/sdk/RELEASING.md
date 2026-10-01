# SDK Releasing

This repo uses a hybrid release model:

- TypeScript, TypeScript Agent SDK, and Python are auto-released from CI.
- Python, Go, PHP, and Ruby Agent SDKs publish through the dedicated Agent SDK workflow; C# shares the existing trusted NuGet workflow; Rust uses its own ordered crates.io workflow.
- Go/C#/Java/PHP/Ruby publish automatically when their committed package version changes on `main`. Java publishes both the core and Agent SDKs.
- Their workflows also support manual dispatch for safe, idempotent recovery.
- C++ remains excluded until functional end-to-end.
- Manual SDK release readiness can be checked with `.github/workflows/sdk-publish-readiness.yml`.

## Canonical Distribution Targets

- TypeScript (`@phaseo/sdk`) -> npm
- TypeScript Agent SDK (`@phaseo/agent-sdk`) -> npm
- Python (`phaseo`) -> PyPI
- Python Agent SDK (`phaseo-agent-sdk`) -> PyPI
- Go (`github.com/phaseoteam/Phaseo/packages/sdk/sdk-go/v3`) -> Go proxy (`pkg.go.dev`) via git tags
- Go Agent SDK (`github.com/phaseoteam/Phaseo/packages/sdk/agent-sdk-go`) -> Go proxy via git tags
- C# (`Phaseo.Sdk`) -> NuGet
- C# Agent SDK (`Phaseo.AgentSdk`) -> NuGet
- Java (`app.phaseo:phaseo-sdk`) -> Maven Central
- Java Agent SDK (`app.phaseo:phaseo-agent-sdk`) -> Maven Central
- PHP (`phaseo/sdk`) -> Packagist
- PHP Agent SDK (`phaseo/agent-sdk`) -> Packagist
- Ruby (`phaseo_sdk`) -> RubyGems
- Ruby Agent SDK (`phaseo_agent_sdk`) -> RubyGems
- Rust (`phaseo`) -> crates.io
- Rust Agent SDK (`phaseo-agent`) -> crates.io

## Auto Release (TS/Python)

CI workflow: `.github/workflows/ci.yml` publish job.

- `changeset:ensure-sdk-autorelease` creates an automatic patch changeset when OpenAPI/SDK surfaces change and no manual changeset is present.
- `changeset:version` now also runs:
  - `sdk-py:sync-version`
  - `sdk:sync-language-manifests`
- OpenAPI generation now runs `openapi:sync-enums` before normalize/codegen so model-id enums stay aligned to `packages/data/catalog/src/data/manifest.json`.

Version manifest sync script:

- `scripts/update-sdk-language-manifest-versions.ts`
  - C#: `packages/sdk/sdk-csharp/Phaseo.Sdk.csproj`
  - Java: `packages/sdk/sdk-java/pom.xml`
  - Ruby: `packages/sdk/sdk-ruby/lib/phaseo_sdk/version.rb`

## GitHub Release Policy

- Package publishing and package changelogs are the source of truth.
- CI now defaults to `PHASEO_GH_RELEASE_MODE=all`.
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

For the pre-1.0 Rust core and Agent SDKs, incompatible changes advance the minor version. A `1.0.0` release is a separate decision to commit to a stable public API.

## Coordinated Core v3 Release

- Core TypeScript, Python, Go, C#, Java, PHP and Ruby SDKs move to `3.0.0` because the native model discovery contract changes. Consumers should review the `providers` to `offers` migration and the updated lifecycle fields before upgrading.
- Rust core and Agent SDKs move to `0.2.0`; the other Agent SDKs move to `0.3.0` alongside their core dependencies.
- The AI SDK provider moves to `2.0.0` for AI SDK 7 / ProviderV4 and Node.js 22 requirements.
- `changeset:version` synchronizes language Agent SDK manifests, core dependency constraints and attribution headers. Private `package.json` files track versions for the native-language packages; they are not npm distributions.
- Go major versions also update the module declaration, dependent imports, examples and documentation. Model constants are regenerated from the canonical generator. The core v3 import path ends in `/v3`.
- The Go workspace and C# project reference allow local tests against unpublished core releases. The packed C# Agent SDK retains a NuGet dependency on `Phaseo.Sdk` at the core project's version.
- `sdk:check-version-literals` exercises version synchronization in an isolated fixture. `packages:pack:ts` installs the actual tarball offline and checks all ESM/CommonJS entrypoints and TypeScript declarations.

Before merging the version PR, run SDK Publish Readiness with secret checks enabled. Maven Central publishing requires its four documented credentials in the `release` environment. A passing package build does not verify registry credentials or OIDC publisher registration.

## Language SDK Publish Workflows

- Agent SDKs: `.github/workflows/publish-agent-sdks.yml`
  - Publishes Python, Go, PHP, and Ruby Agent SDKs independently and idempotently
  - Uses the protected `release` environment
  - Uses OIDC trusted publishing for PyPI and RubyGems
  - Trusted-publisher identity: repository owner `phaseoteam`, repository `Phaseo`, workflow `publish-agent-sdks.yml`, environment `release`
  - Uses the Phaseo GitHub App for Go tags and the PHP split repository
  - Refreshes `phaseo/agent-sdk` on Packagist with the required `PACKAGIST_USERNAME` and `PACKAGIST_SAFE_TOKEN` release-environment secrets
  - Optional repo variable: `PHP_AGENT_SDK_SPLIT_REPO` (defaults to `phaseoteam/phaseo-php-agent-sdk`)

- Rust: `.github/workflows/publish-sdk-rust.yml`
  - Publishes `phaseo` before the dependent `phaseo-agent` crate
  - Uses crates.io trusted publishing with repository `phaseoteam/Phaseo`, workflow `publish-sdk-rust.yml`, and environment `release`
  - Uses the temporary `CRATES_IO_BOOTSTRAP_TOKEN` release secret only for the first publication; remove it after trusted publishing is configured
  - Creates monorepo tags `packages/sdk/sdk-rust/vX.Y.Z` and `packages/sdk/agent-sdk-rust/vX.Y.Z`

- First npm publish / bootstrap: `.github/workflows/npm-bootstrap-publish.yml`
  - Supports `@phaseo/agent-sdk`, `@phaseo/ai-sdk-provider`, and `@phaseo/devtools-viewer`
  - Uses pnpm trusted publishing so workspace dependencies are rewritten to registry versions in the published tarball

- Go: `.github/workflows/publish-sdk-go.yml`
  - Publishes by creating/pushing tag `packages/sdk/sdk-go/vX.Y.Z`

- C#: `.github/workflows/publish-sdk-csharp.yml`
  - Publishes base and Agent SDK `.nupkg` and `.snupkg` files to NuGet
  - Uses NuGet trusted publishing (OIDC), no API key secret required
  - Trusted-publisher identity: package owner `Phaseo`, repository `phaseoteam/Phaseo`, workflow `publish-sdk-csharp.yml`
  - Optional repo variable: `NUGET_TRUSTED_PUBLISHING_USER` (defaults to repo owner)

- Java: `.github/workflows/publish-sdk-java.yml`
  - Tests and packages core and Agent SDKs on relevant pull requests, without release secrets
  - Builds/signs and deploys core before Agent to Maven Central on `main`
  - Checks each artifact independently and skips published versions, including when only the Agent SDK needs publishing
  - Runs when either package version or the publishing workflow changes; manual dispatch checks the optional core version against the committed manifest
  - Required secrets:
    - `MAVEN_CENTRAL_USERNAME`
    - `MAVEN_CENTRAL_PASSWORD`
    - `MAVEN_GPG_PRIVATE_KEY`
    - `MAVEN_GPG_PASSPHRASE`

- PHP: `.github/workflows/publish-sdk-php.yml`
  - Publishes by creating/pushing monorepo tag `sdk-php/vX.Y.Z`
  - Syncs `packages/sdk/sdk-php` to split repo main and pushes split tag `vX.Y.Z`
  - Uses the Phaseo GitHub App token to update the split repository
  - Refreshes `phaseo/sdk` through the Packagist API after publishing the split tag
  - Required `release` environment secrets:
    - `PACKAGIST_USERNAME`
    - `PACKAGIST_SAFE_TOKEN`
  - Optional repo variable:
    - `PHP_SDK_SPLIT_REPO` (defaults to `phaseoteam/phaseo-php-sdk`)

- PHP split sync automation: `.github/workflows/sync-sdk-php-split.yml`
  - Keeps split repo main in sync from monorepo path `packages/sdk/sdk-php/**` on pushes to main

- Ruby: `.github/workflows/publish-sdk-ruby.yml`
  - Builds the gem, publishes through RubyGems trusted publishing, and creates/pushes tag `sdk-ruby/vX.Y.Z`
  - Uses OIDC; no RubyGems API key is stored

## Publish Readiness Checks

- Run `.github/workflows/sdk-publish-readiness.yml` (workflow_dispatch) before first publish and after registry credential rotation.
- It validates package buildability for each ecosystem and checks required publish secrets when `checkSecrets=true`.
