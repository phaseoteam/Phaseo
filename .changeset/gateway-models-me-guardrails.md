---
"@phaseo/gateway-api": minor
"@phaseo/sdk": minor
---

`GET /v1/models/me` now returns the model list as your key may use it: your workspace's privacy and provider rules and the guardrails on the key's departments, member and key are applied, so blocked models, and models with no allowed provider, are left out. Each model lists only the offers its requests may be routed to, with its prices, capabilities and availability from those. An `access` object says what the rules left out (`GatewayModelAccess` in the SDK types). It previously returned 501.
