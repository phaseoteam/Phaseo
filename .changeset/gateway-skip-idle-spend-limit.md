---
"@phaseo/gateway-api": patch
---

Requests from an API key with no spend limits, in a workspace with no workspace or department budgets, no longer wait for the spend-limit check. The gateway confirms there is nothing to limit with a small cached read that runs alongside the request lookup. Keys and workspaces with any limit are checked exactly as before, and a limit added later takes effect within a minute, as it does today.
