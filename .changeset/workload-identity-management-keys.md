---
"@phaseo/gateway-api": minor
---

Trusted workload policies (`/v1/workload-identity/policies`) can now be managed with management keys and OAuth tokens as well as from the dashboard: `keys:read` to list and get, `keys:write` to create and update, `keys:delete` to delete. OAuth users must be workspace owners or admins. The endpoints are in the public OpenAPI spec and generated SDK clients, and stay limited to workspaces in the trusted workloads beta.
