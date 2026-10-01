---
"@phaseo/gateway-api": patch
---

Finalize request charging, provider usage and audit before optional response-cache and routing-affinity writes, so stalled advisory writes cannot prevent accounting from starting.
