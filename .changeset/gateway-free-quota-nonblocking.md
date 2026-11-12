---
"@phaseo/gateway-api": patch
---

The first free-model request from a new user no longer waits for the free-model daily allowance counter to start up. The gateway waits at most 100 ms, then lets the request through while the counter counts it in the background. Free models stay limited: at most 2 requests per user per server instance per day can go over the daily allowance this way, and only while the counter is starting up or slow.
