---
"@phaseo/cpp-sdk": patch
"@phaseo/csharp-sdk": patch
"@phaseo/docs": patch
"@phaseo/gateway-api": patch
"@phaseo/go-sdk": patch
"@phaseo/java-sdk": patch
"@phaseo/php-sdk": patch
"@phaseo/py-sdk": patch
"@phaseo/ruby-sdk": patch
"@phaseo/rust-sdk": patch
"@phaseo/sdk": patch
"@phaseo/web": patch
"@phaseo/web-api": patch
---

Sign custom webhook notification deliveries. New custom webhook destinations get a `whsec_` signing secret, shown once, and every delivery (routed alerts and tests sent from a saved destination) carries `x-phaseo-timestamp` and `x-phaseo-signature`, the hex HMAC-SHA256 of `<timestamp>.<raw body>`: the same scheme as video and batch webhooks. Deliveries also carry `x-phaseo-event-id` and `x-phaseo-event-type`. Destinations created before this change have no secret and keep sending unsigned; Settings marks them **Unsigned** and offers **Generate secret**. `POST /v1/notifications/destinations/{id}/rotate-secret` generates or replaces a secret, and destinations now report `has_signing_secret` and `signing_secret_rotated_at`.
