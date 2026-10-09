---
"@phaseo/gateway-api": patch
---

Cut per-request lookups before upstream: skip the testing-mode role lookup for models without an internal route, and share API-key and workspace version counters per location through the Workers Cache with an absolute 30-second expiry.
