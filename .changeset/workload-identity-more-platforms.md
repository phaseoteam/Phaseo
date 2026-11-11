---
"@phaseo/gateway-api": minor
"@phaseo/sdk": minor
"@phaseo/py-sdk": minor
"@phaseo/go-sdk": minor
"@phaseo/csharp-sdk": minor
"@phaseo/java-sdk": minor
"@phaseo/php-sdk": minor
"@phaseo/ruby-sdk": minor
"@phaseo/rust-sdk": minor
"@phaseo/cpp-sdk": minor
"@phaseo/cli": minor
---

Trusted workload policies now accept tokens from GitLab (`gitlab`), Google Cloud (`google_cloud`), Buildkite (`buildkite`), CircleCI (`circleci`) and AWS (`aws`) as well as Vercel and GitHub Actions, and from your own OIDC issuer (`custom`), such as a Kubernetes cluster, Bitbucket Pipelines or self-managed GitLab. Policies return `owner_claim`, the claim `owner_id` is matched against; it is fixed for each platform and required when creating a `custom` policy. `issuer` can be omitted for GitHub Actions, GitLab, Google Cloud and Buildkite. Claim names can now use `:` and `/` and be up to 128 characters. The generated SDK models include the new providers and `owner_claim`, and `phaseo workload-identity policies create` takes `--owner-claim`.
