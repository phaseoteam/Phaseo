---
"@phaseo/gateway-api": patch
"@phaseo/web-api": patch
---

Harden key revocation and policy cache invalidation, tolerate bounded public-catalog clock skew, and preserve analytics for rejected requests. Remove unused in-flight health writes and record internally buffered text completions in shared routing health without counting synthetic output twice.

Restore Alibaba Responses reasoning-effort mapping and explicitly price Laguna XS free cached input at zero.
