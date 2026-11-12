---
"@phaseo/gateway-api": patch
---

Zero data retention now keeps a request's content out of everything Phaseo stores. A ZDR request is never stored in or served from the response cache, even on a key with response caching on; its cache status is `bypass` with reason `zero_data_retention`. It is never sampled for data contribution. ZDR applies when the workspace setting is on, when one of the key's guardrails requires it, or when the request itself (or its preset) sets `require_zero_data_retention` (or `zdr`) under `provider` or `routing`. That per-request flag now also keeps the request's content out of its I/O log and its stored request details, and out of Phaseo's own telemetry, as the workspace and guardrail settings already did. A preset's flag applies even when the request fails before routing. The data contribution discount, broadcasts to a workspace's own destinations, and the search and fetch details in the request log are unchanged.
