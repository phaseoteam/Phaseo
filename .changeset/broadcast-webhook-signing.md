---
"@phaseo/gateway-api": minor
"@phaseo/web-api": minor
"@phaseo/web": minor
---

Broadcast webhook destinations can set a signing secret. Deliveries, connection tests and sample traces then carry `x-phaseo-timestamp` and `x-phaseo-signature`, the hex HMAC-SHA256 of `<timestamp>.<body>`, the same scheme as workspace webhooks.
