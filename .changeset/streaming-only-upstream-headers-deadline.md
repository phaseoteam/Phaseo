---
"@phaseo/gateway-api": patch
---

Apply the upstream response-headers deadline only to streaming requests, and enable it at 60 seconds, so a stalled streaming provider fails over without cutting off long non-streaming generations.
