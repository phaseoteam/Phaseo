# Releasing

## One-time setup

1. Create `phaseoteam/terraform-provider-phaseo` as an empty public GitHub repository. Do not initialize it with a README or license; the first subtree push must establish its history.
2. Seed the repository once with a subtree split from the Phaseo monorepo.
3. Run the generated repository's `Sync from Phaseo monorepo` workflow and confirm it can update its provider-only history using its repository-scoped `GITHUB_TOKEN`.
4. Generate an RSA GPG signing key. Add its armored private key as `GPG_PRIVATE_KEY` and its passphrase as `PASSPHRASE` in the generated repository's protected `publish` environment secrets.
5. Add the armored public key to the Phaseo namespace in Terraform Registry.

The generated repository checks the monorepo hourly and also supports manual synchronization. No cross-repository secret or long-lived personal token is required.

## Release

Provider development and release-file changes are made in the monorepo. After they reach the generated repository:

1. Confirm its `Test` workflow passes.
2. Create and push a unique semantic-version tag, such as `v0.1.0`, in the generated repository.
3. The `Release` workflow tests, cross-compiles, checksums, signs, and creates a draft GitHub release.
4. Inspect the draft assets, then publish the release.
5. For the first version, select **Publish → Provider** in Terraform Registry and choose `phaseoteam/terraform-provider-phaseo`.

Never reuse or replace a published version. Publish fixes under a new semantic version.
