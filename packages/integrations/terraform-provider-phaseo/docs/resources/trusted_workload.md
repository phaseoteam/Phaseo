---
page_title: "phaseo_trusted_workload Resource"
description: |-
  Lets deployments, CI jobs and cloud workloads call Phaseo with their OIDC token instead of an API key.
---

# phaseo_trusted_workload

```terraform
resource "phaseo_trusted_workload" "deploy" {
  name     = "GitHub deploy (main)"
  platform = "github_actions"
  owner_id = "123456"

  claim_conditions = {
    repository_id = ["987654321"]
    ref           = ["refs/heads/main"]
  }
}

resource "phaseo_trusted_workload" "website" {
  name     = "Website production"
  platform = "vercel"
  issuer   = "https://oidc.vercel.com/acme"
  owner_id = "team_abc123"

  claim_conditions = {
    project_id  = ["prj_abc123"]
    environment = ["production"]
  }
}

resource "phaseo_trusted_workload" "worker" {
  name     = "Cloud Run worker"
  platform = "google_cloud"
  owner_id = "112233445566778899000" # the service account's unique ID, not its email
}

resource "phaseo_trusted_workload" "cluster" {
  name        = "Production cluster"
  platform    = "custom"
  issuer      = "https://oidc.example.com"
  owner_claim = "sub"
  owner_id    = "system:serviceaccount:prod:api"
}
```

A trust policy. A token is accepted when its issuer and owner match the policy, it was issued for the audience in `audience` (`https://api.phaseo.app`) and every claim condition matches. The request then runs as the policy's key, with its limits, budgets, logs and billing. Nothing secret is created, so nothing sensitive is stored in Terraform state.

Each platform pins the owner to one claim that can't be renamed or re-registered by someone else:

| `platform` | `issuer` | Owner claim (`owner_id` is its value) |
| --- | --- | --- |
| `vercel` | Required: `https://oidc.vercel.com/<team slug>`, or `https://oidc.vercel.com` for global mode | `owner_id` (team ID) |
| `github_actions` | Defaults to `https://token.actions.githubusercontent.com`; add `/<enterprise slug>` for a customised enterprise issuer | `repository_owner_id` (organisation or user ID) |
| `gitlab` | Defaults to `https://gitlab.com`. Use `custom` for self-managed GitLab | `project_id` |
| `google_cloud` | Defaults to `https://accounts.google.com` | `sub` (the service account's unique ID) |
| `buildkite` | Defaults to `https://agent.buildkite.com` | `organization_id` |
| `circleci` | Required: `https://oidc.circleci.com/org/<organization ID>` | `oidc.circleci.com/org-id` (the organization ID in the issuer) |
| `aws` | Required: your account's `https://<id>.tokens.sts.global.api.aws` issuer | `sub` (the IAM role ARN) |
| `custom` | Required: any public `https://` issuer that serves an OIDC discovery document, such as a Kubernetes cluster or Bitbucket Pipelines | Your choice, set with `owner_claim` |

Trusted workloads are in beta. Only workspaces in the beta can use this resource; other workspaces get `404`. The management key needs `keys:read`, `keys:write` and `keys:delete`. A workspace can have up to 50 policies. Changes reach the gateway within a minute.

## Schema

### Required

- `name` (String) Policy name, up to 100 characters. It must not start or end with whitespace, because the API trims it.
- `platform` (String) `vercel`, `github_actions`, `gitlab`, `google_cloud`, `buildkite`, `circleci`, `aws` or `custom`. Changing it replaces the policy.
- `owner_id` (String) The value the owner claim must equal (see the table above). Changing it replaces the policy.

### Optional

- `issuer` (String) Token issuer. Optional for `github_actions`, `gitlab`, `google_cloud` and `buildkite`, which have a default; required for the other platforms. Changing it replaces the policy.
- `owner_claim` (String) The claim `owner_id` is matched against. Required when `platform` is `custom`, for example `sub`. The other platforms always use the claim in the table above, so leave it unset; it is filled in for you. Changing it replaces the policy.
- `claim_conditions` (Map of List of String) Extra claims the token must match: claim name to allowed values. Every claim must match one of its values. Up to 15 claims (the owner claim makes 16) and 20 values per claim. Claim names are up to 128 letters, digits, `.`, `_`, `:`, `/` or `-`. `iss`, `aud`, `exp`, `iat`, `nbf`, `jti` and the owner claim can't be used. Removing conditions from the configuration, or setting `{}`, removes them from the policy.
- `max_token_lifetime_seconds` (Number) Longest token lifetime the policy accepts, from 60 to 43200 seconds. Defaults to `43200`.
- `enabled` (Boolean) Whether matching tokens are accepted. Defaults to `true`.

### Read-only

- `id` (String) Policy identifier.
- `audience` (String) The audience tokens must be issued for.
- `key_id` (String) The policy's key. Requests, usage and limits are recorded against it.
- `created_at` (String) Creation timestamp.
- `updated_at` (String) Last update timestamp.

## Import

```shell
terraform import phaseo_trusted_workload.deploy 11111111-1111-4111-8111-111111111111
```
