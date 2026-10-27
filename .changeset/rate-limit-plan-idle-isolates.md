---
"@phaseo/gateway-api": patch
---

Rate limit policies now apply to the first request a gateway isolate handles after sitting idle. Before, that request used whatever plan the isolate had last seen, however old, so a newly added policy could let it through unlimited and without rate limit headers.
