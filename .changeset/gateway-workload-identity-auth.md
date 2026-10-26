---
"@phaseo/gateway-api": minor
---

The gateway can accept short-lived OIDC tokens from Vercel deployments and GitHub Actions in place of an API key, when a workspace trust policy matches the token. Off until WORKLOAD_IDENTITY_AUTH_ENABLED is "true"; policies can only be created by operators for now.
