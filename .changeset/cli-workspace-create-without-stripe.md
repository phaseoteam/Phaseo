---
"@phaseo/gateway-api": patch
---

The management `POST /workspaces` route (used by `phaseo workspaces create`) no longer fails with "Stripe customer provisioning is not configured". As in the web create-workspace flow, the wallet and Stripe customer are now created at the first checkout when they can't be created up front.
