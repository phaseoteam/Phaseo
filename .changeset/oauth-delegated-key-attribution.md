---
"@phaseo/gateway-api": patch
---

Requests made with the key an OAuth app gets when someone signs in with Phaseo are now recorded as OAuth requests from that app and that person, so they appear in the app's usage under Settings → OAuth apps and carry the app's client ID in request logs. They used to be logged as plain API key requests with no app. The key still counts against its own limits, rate limit policies and spend rules as before.
