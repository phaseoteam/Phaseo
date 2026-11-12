---
"@phaseo/web": minor
"@phaseo/web-api": minor
"@phaseo/gateway-api": patch
"@phaseo/docs": patch
---

Add a Budgets settings page (`/settings/budgets`). Owners and admins can set, change and delete the workspace's daily, weekly, monthly and lifetime budgets; everyone in the workspace can see each budget's spend so far, percent used, reset time and a projection for the period. Usage comes from the same SQL function the gateway enforces with. Writes use the control API's validation (now shared through `packages/shared/workspace-budgets`), are audit-logged with the same actions, and invalidate the gateway's cached workspace context.
