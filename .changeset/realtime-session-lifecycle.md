---
"@phaseo/gateway-api": minor
"@phaseo/sdk": patch
"@phaseo/py-sdk": patch
---

Realtime voice calls now end cleanly and report their final bill. Clients can send `session.end`, and every ending (client, provider or gateway) sends `session.ended` with a stable reason code, the duration, usage and cost. `session.warning` reports an approaching session limit, low funds, overdraft use and spend limits. API sessions are no longer ended for being idle or for reaching a spend limit. When a credit hold can't be extended they keep running until $1 of overdraft is used. A revoked key, an expired or paused key, or a removed workspace still ends the call. Session limits now follow each provider and count from when the relay connects: OpenAI Realtime 60 minutes, xAI 120, Google 60 and GPT Live 25. The create-session response adds `max_duration_seconds` and `idle_timeout_seconds`.
