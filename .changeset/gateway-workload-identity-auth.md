---
"@phaseo/gateway-api": minor
---

The gateway can accept short-lived OIDC tokens from Vercel deployments and GitHub Actions in place of an API key, when a workspace trust policy matches the token. Workspaces get it only through the Statsig gate `gateway_workload_identity` (override with STATSIG_WORKLOAD_IDENTITY_GATE); WORKLOAD_IDENTITY_AUTH_ENABLED="false" turns it off everywhere. Policies can only be created by operators for now.
