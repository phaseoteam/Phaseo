---
"@phaseo/gateway-api": patch
---

The stored per-step timing now also splits the context lookup into the context fetch itself, the preset access check, the private-model lookup, the cache write and the wait for the spend-limit check. Responses are unchanged.
