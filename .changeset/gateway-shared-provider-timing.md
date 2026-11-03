---
"@phaseo/gateway-api": patch
---

Latency is now measured the same way for every response, whatever the provider. Responses the gateway reads to the end before replying (non-streaming clients, and server-tool requests, including streamed ones) take provider time from the selected dispatch and record provider time to first token, so the provider's wait no longer counts as Phaseo overhead.
