# Phaseo Package Manager Readiness

Last checked: 2026-07-06.

## Current Published State

### npm

Published:

- `@phaseo/sdk@2.0.5`
- `@phaseo/agent-sdk@0.1.1`
- `@phaseo/ai-sdk-provider@1.0.1`
- `@phaseo/cli@0.1.1`
- `@phaseo/devtools-viewer@0.2.1`

Deprecated old names:

- `@ai-stats/sdk` -> `@phaseo/sdk`
- `@ai-stats/agent-sdk` -> `@phaseo/agent-sdk`
- `@ai-stats/ai-sdk-provider` -> `@phaseo/ai-sdk-provider`
- `@ai-stats/cli` -> `@phaseo/cli`
- `@ai-stats/devtools-viewer` -> `@phaseo/devtools-viewer`

Blocked:

- Bare `phaseo` is blocked by npm's similarity policy because it is too close to `phaser`.
- Use scoped `@phaseo/*` packages as the canonical npm install path.

### PyPI

Published:

- `phaseo@2.0.5`
- `ai-stats-py-sdk@2.0.5`

Current migration shape:

- `phaseo` is the new install name.
- `ai-stats-py-sdk` remains installable for existing users and carries a deprecated-package-name notice.
- `phaseo==2.0.5` depends on `ai-stats-py-sdk==2.0.5` while the Python import/module migration is completed.

## Target Names By Ecosystem

These names were checked as available on 2026-07-06.

| Ecosystem | Main SDK target | Agent SDK target | Current repo metadata | Status |
| --- | --- | --- | --- | --- |
| RubyGems | `phaseo` | `phaseo_agent_sdk` | `ai_stats_sdk`, `ai_stats_agent_sdk` | Names available; rename gemspecs before publish |
| Packagist/Composer | `phaseo/sdk` | `phaseo/agent-sdk` | `phaseo/sdk`, `phaseo/agent-sdk` | Account renamed to `phaseo`; local metadata updated; submit after split repo is updated |
| NuGet | `Phaseo.Sdk` | `Phaseo.AgentSdk` | `AI.Stats.Sdk`, `AI.Stats.AgentSdk` | Names available; package IDs should be renamed |
| Maven Central | `app.phaseo:phaseo-sdk` | `app.phaseo:phaseo-agent-sdk` | `app.phaseo:ai-stats-sdk` | Namespace appears unused; Central namespace verification needed |
| crates.io | `phaseo` | `phaseo-agent-sdk` | `ai-stats-rust-sdk` | Names available; Cargo metadata incomplete |
| Go modules | `github.com/phaseoteam/Phaseo/packages/sdk/sdk-go` | `github.com/phaseoteam/Phaseo/packages/sdk/agent-sdk-go` | Already on Phaseo repo path | Use Git tags; no registry account needed |

## Registry Setup Checklist

### RubyGems

Official publishing path: build a `.gem` and push it with `gem push`. RubyGems also supports GitHub Actions trusted publishing so releases do not require stored long-lived API tokens.

Recommended setup:

1. Create/confirm RubyGems account and Phaseo organization ownership.
2. Decide whether to publish real renamed gems or transitional wrapper gems first.
3. Rename/package:
   - `packages/sdk/sdk-ruby/ai_stats_sdk.gemspec` -> `phaseo.gemspec`
   - `packages/sdk/agent-sdk-ruby/ai_stats_agent_sdk.gemspec` -> `phaseo_agent_sdk.gemspec`
4. Configure RubyGems trusted publishing for the release workflow, or add a scoped `RUBYGEMS_API_KEY` secret.
5. Publish:

```bash
cd packages/sdk/sdk-ruby
gem build phaseo.gemspec
gem push phaseo-<version>.gem
```

References:

- RubyGems publishing guide: https://guides.rubygems.org/publishing/
- RubyGems trusted publishing: https://guides.rubygems.org/trusted-publishing/

### Packagist / Composer

Packagist reads package metadata from a public VCS repository and versions from tags. The current workflow already splits `packages/sdk/sdk-php` into a dedicated repo defaulting to `phaseoteam/phaseo-php-sdk`.

Recommended setup:

1. Create/confirm `phaseoteam/phaseo-php-sdk` split repository.
2. Submit the split repo URL to Packagist after the package metadata is pushed to `phaseoteam/phaseo-php-sdk`.
3. Enable GitHub/Packagist webhook or keep using the `PACKAGIST_USERNAME` + `PACKAGIST_MAIN_TOKEN` workflow notification.
4. Update the GitHub Actions `PACKAGIST_USERNAME` secret to `phaseo` after the Packagist account rename.
5. Tag releases as `vX.Y.Z` in the split repo.

Reference:

- Packagist package submission/update guidance: https://packagist.org/about

### NuGet

The current C# workflow already uses NuGet trusted publishing via `NuGet/login`.

Recommended setup:

1. Create/confirm nuget.org account/organization.
2. Configure trusted publishing for `phaseoteam/Phaseo`.
3. Reserve the `Phaseo` package ID prefix if available.
4. Rename package IDs:
   - `AI.Stats.Sdk` -> `Phaseo.Sdk`
   - `AI.Stats.AgentSdk` -> `Phaseo.AgentSdk`
5. Pack and push:

```bash
dotnet pack packages/sdk/sdk-csharp/AIStats.Sdk.csproj -c Release -o artifacts/csharp
dotnet nuget push "artifacts/csharp/*.nupkg" --api-key "$env:NUGET_API_KEY" --source "https://api.nuget.org/v3/index.json"
```

Reference:

- NuGet publishing guide: https://learn.microsoft.com/en-us/nuget/nuget-org/publish-a-package

### Maven Central

The Java POM already uses `groupId` `app.phaseo` and the Central publishing plugin. The artifact id still needs renaming from `ai-stats-sdk` to `phaseo-sdk`.

Recommended setup:

1. Create a Sonatype Central Portal account.
2. Register and verify the `app.phaseo` namespace.
3. Create a Central Portal token.
4. Configure GitHub secrets:
   - `MAVEN_CENTRAL_USERNAME`
   - `MAVEN_CENTRAL_PASSWORD`
   - `MAVEN_GPG_PRIVATE_KEY`
   - `MAVEN_GPG_PASSPHRASE`
5. Rename artifact:
   - `app.phaseo:ai-stats-sdk` -> `app.phaseo:phaseo-sdk`
6. Add an agent SDK POM before publishing `phaseo-agent-sdk`.
7. Publish through the existing `publish-sdk-java.yml` workflow.

Reference:

- Sonatype Central Publisher Portal guide: https://central.sonatype.org/publish/publish-portal-guide/

### crates.io

The current Rust SDK is marked `0.2.1-alpha.0` and has minimal Cargo metadata. crates.io requires a unique name and expects package metadata such as license, description, homepage, repository, and readme.

Recommended setup:

1. Log in to crates.io and run `cargo login`.
2. Rename crate:
   - `ai-stats-rust-sdk` -> `phaseo`
3. Add Cargo metadata:
   - `description`
   - `license`
   - `homepage`
   - `repository`
   - `readme`
   - `keywords`
   - `categories`
4. Dry-run before publishing:

```bash
cd packages/sdk/sdk-rust
cargo publish --dry-run
```

Reference:

- Cargo publishing guide: https://doc.rust-lang.org/cargo/reference/publishing.html

### Go Modules

Go does not require a package registry account for standard public consumption. The modules already use the Phaseo repository path:

- `github.com/phaseoteam/Phaseo/packages/sdk/sdk-go`
- `github.com/phaseoteam/Phaseo/packages/sdk/agent-sdk-go`

Recommended setup:

1. Keep these module paths.
2. Use semver tags with subdirectory prefixes if publishing from a monorepo:
   - `packages/sdk/sdk-go/vX.Y.Z`
   - `packages/sdk/agent-sdk-go/vX.Y.Z`
3. Confirm users can install with:

```bash
go get github.com/phaseoteam/Phaseo/packages/sdk/sdk-go@latest
```

## Recommended Publish Order

1. Finish Python/npm docs because those packages are already live.
2. Publish NuGet packages next; the workflow is already modern and uses trusted publishing.
3. Publish RubyGems next; setup is straightforward and package names are free.
4. Publish PHP through split repos and Packagist once the split repository naming is final.
5. Publish Java after the `app.phaseo` Central namespace is verified.
6. Publish Rust last after deciding whether the alpha SDK is mature enough to claim the `phaseo` crate.

## Open Decisions

- Whether to publish full renamed packages immediately, or publish transition wrappers first for Ruby/PHP/.NET/Java/Rust.
- Whether old language package names should remain installable indefinitely, get deprecated, or be left unpublished if they were never public.
- Whether SDK namespaces/classes should change now, or whether install package names should move first while imports remain compatibility-focused.
- Whether to rename repo folders in this branch or keep folder names stable until release automation is updated.
