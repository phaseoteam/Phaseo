---
"@phaseo/gateway-api": patch
"@phaseo/sdk": minor
"@phaseo/py-sdk": minor
---

Expose authenticated, streamed Anthropic batch result downloads and return the Phaseo download URL in batch responses. Preserve workspace ownership and avoid additional inference charges on downloads. Clarify that webhook retries only follow failed deliveries.

Add TypeScript and Python streaming batch-result helpers with cancellation and early-close support for large outputs.
