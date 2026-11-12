---
"@phaseo/gateway-api": patch
---

`GET /v1/pricing/models` returns every active price row again. It stopped at the database's 1,000-row page, so most models and providers were missing.
