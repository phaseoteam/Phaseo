---
"@phaseo/gateway-api": minor
---

`GET /v1/models/me` now returns the model list as your key may use it: your workspace's privacy and provider rules and the guardrails on the key's departments, member and key are applied, so blocked models, and models with no allowed provider, are left out, and each model lists only the offers its requests may be routed to. It previously returned 501.
