---
"@phaseo/gateway-api": patch
---

Bound the remaining request-path waits on work started by other requests (price cards, routing health reads and updates, key versions, context loads), so a cancelled request can no longer leave concurrent requests hanging until the runtime cancels them.
