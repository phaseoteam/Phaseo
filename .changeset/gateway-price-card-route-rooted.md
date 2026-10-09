---
"@phaseo/gateway-api": patch
---

Load price cards from the matching route instead of scanning every active pricing SKU, cutting the lookup from ~340ms to under 1ms in the database.
