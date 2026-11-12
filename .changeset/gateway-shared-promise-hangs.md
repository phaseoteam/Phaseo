---
"@phaseo/gateway-api": patch
---

Bound waits on cache loads, provider lease acquisitions, and Statsig evaluations started by another request, so a cancelled request can no longer leave concurrent requests hanging until the runtime cancels them.
