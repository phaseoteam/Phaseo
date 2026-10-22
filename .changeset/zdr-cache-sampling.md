---
"@phaseo/gateway-api": patch
---

Zero data retention now keeps a request's content out of everything Phaseo stores. A ZDR request is never stored in or served from the response cache, even on a key with response caching on; its cache status is `bypass` with reason `zero_data_retention`. It is never sampled for data contribution. ZDR applies when the workspace setting is on, when one of the key's guardrails requires it, or when the request itself (or its preset) sets `require_zero_data_retention` (or `zdr`) under `provider` or `routing`. That per-request flag now also skips the request's I/O log and keeps its content out of Phaseo's own telemetry, as the workspace and guardrail settings already did. The data contribution discount, broadcasts to a workspace's own destinations, and the search and fetch details in the request log are unchanged.
