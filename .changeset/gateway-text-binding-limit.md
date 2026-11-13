---
"@phaseo/gateway-api": patch
---

Bring the gateway Worker back under Cloudflare's limit of 200 text bindings so it deploys again. Three model-discovery variables that repeated their code defaults are removed from the gateway config (the jobs Worker keeps them), and the management API rate limiter now enforces whenever its binding is configured, so `CONTROL_API_RATE_LIMIT_MODE` is only needed to set `"shadow"` or `"off"`.
