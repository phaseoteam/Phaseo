---
"@phaseo/gateway-api": patch
---

Keep request and response content out of Phaseo's own error and sampled telemetry under zero data retention, as for keys created with `never_store_content`. ZDR applies when the workspace setting is on or when one of the key's guardrails requires it. The telemetry event keeps its operational detail (routing, attempts, headers, error codes and messages). It no longer carries the gateway request, upstream request, provider response, gateway response, raw upstream error body or error details. The provider attempts it lists also drop the truncated raw body of a failed provider response, under ZDR and for `never_store_content` keys. Requests rejected before routing read the key's policy, as they already did for `never_store_content`. Broadcasts to a workspace's own destinations are unchanged.
