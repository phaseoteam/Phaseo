---
"@phaseo/gateway-api": patch
---

Wire the spend-limit coordinator's shadow mode into the request path. With `GATEWAY_SPEND_LIMIT_DO_MODE=shadow`, requests on API keys with limits or budgets are compared against the coordinator in the background and their successful spend is recorded to it; divergences are logged. Enforcement is unchanged and the mode stays `off` by default.
