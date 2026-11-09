---
"@phaseo/gateway-api": patch
---

Request records now keep each provider attempt's start and end time, HTTP status text and the provider's error code, message and description. Nothing reads them yet; this is internal groundwork for request-detail views.
