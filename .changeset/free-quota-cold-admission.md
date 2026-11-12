---
"@phaseo/gateway-api": patch
---

Enforce the daily free-model allowance on the first request to each gateway isolate: an isolate without recent headroom for a user now asks the counter before admitting, so an exhausted user can no longer get free requests through on every new isolate.
