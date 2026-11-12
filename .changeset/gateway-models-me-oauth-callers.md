---
"@phaseo/gateway-api": patch
---

`GET /v1/models/me` called with an OAuth access token (a CLI or app sign-in) now returns 403 `api_key_required`, explaining that it lists the models an API key may use, instead of failing with a 500.
