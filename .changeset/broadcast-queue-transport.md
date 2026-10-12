---
"@phaseo/gateway-api": patch
---

Broadcast exports can now be delivered through a Cloudflare Queue instead of the Postgres outbox. With `BROADCAST_QUEUE` bound and `BROADCAST_QUEUE_ENABLED=true`, each request is sent as one queue message whatever its number of destinations, and the gateway's queue handler sends one OTLP request per destination per batch. Prompts and outputs stay out of the message when no selected destination receives them, and large events are kept in R2 until delivered. Without the binding, exports use the outbox as before.
