---
"@phaseo/gateway-api": patch
---

Requests no longer wait up to 2 seconds for a spend-limit check that is starting up. After 150 ms the gateway uses the limit check it has already loaded, and the request's cost is still recorded. This removes about 240 ms from the first request after a workspace has been idle.
