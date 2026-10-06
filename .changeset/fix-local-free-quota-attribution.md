---
"@phaseo/gateway-api": patch
---

Preserve local user quota attribution and daily quota details when rebuilding error responses, without reporting an undispatched candidate as an upstream provider failure. Keep prior provider attempt diagnostics and upstream rate-limit attribution.
