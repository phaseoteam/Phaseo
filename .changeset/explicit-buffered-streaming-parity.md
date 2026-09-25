---
"@phaseo/gateway-api": patch
---

Require explicit provider-route parity before using streaming transport for buffered text requests, preserving native non-streaming for unknown capabilities and reevaluating the decision on fallback.

Preserve Responses incomplete reasons for token limits and content filtering on the native buffered path, matching streaming terminals.
