---
"@phaseo/gateway-api": patch
---

Each request's stored response timeline now includes how long each step before the first provider call took (authentication, body parsing and validation, the context lookup with its cache read and database call, workspace policy, pricing, provider ranking and more), and whether the context came from cache. Responses are unchanged.
