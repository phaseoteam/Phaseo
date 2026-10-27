---
page_title: "phaseo_trusted_workload Resource"
description: |-
  Lets Vercel deployments or GitHub Actions workflows call Phaseo with their OIDC token instead of an API key.
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
```

A trust policy. A token is accepted when its issuer and owner match the policy, it was issued for the audience in `audience` (`https://api.phaseo.app`) and every claim condition matches. The request then runs as the policy's key, with its limits, budgets, logs and billing. Nothing secret is created, so nothing sensitive is stored in Terraform state.

Trusted workloads are in beta. Only workspaces in the beta can use this resource; other workspaces get `404`. The management key needs `keys:read`, `keys:write` and `keys:delete`. A workspace can have up to 50 policies. Changes reach the gateway within a minute.

## Schema

### Required

- `name` (String) Policy name, up to 100 characters. It must not start or end with whitespace, because the API trims it.
- `platform` (String) `vercel` or `github_actions`. Changing it replaces the policy.
- `owner_id` (String) The Vercel team ID (the token's `owner_id` claim), or the GitHub organisation or user ID (`repository_owner_id`). Changing it replaces the policy.

### Optional

- `issuer` (String) Token issuer. Required for Vercel: `https://oidc.vercel.com/<team slug>` for team issuer mode, or `https://oidc.vercel.com` for global mode. Defaults to `https://token.actions.githubusercontent.com` for GitHub Actions. Changing it replaces the policy.
- `claim_conditions` (Map of List of String) Extra claims the token must match: claim name to allowed values. Every claim must match one of its values. Up to 15 claims (the owner claim makes 16) and 20 values per claim. `iss`, `aud`, `exp`, `iat`, `nbf`, `jti` and the owner claim can't be used. Removing conditions from the configuration, or setting `{}`, removes them from the policy.
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
