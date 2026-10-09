---
"@phaseo/gateway-api": patch
---

Reduce cold-isolate latency: load request context alongside the testing-mode check, share workspace policy and confirmed private-model absence per location through the Workers Cache, and build request schemas on first use instead of at Worker startup.
