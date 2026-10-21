---
"@phaseo/gateway-api": patch
---

Accept a Phaseo key in the `x-api-key` header on `/v1` routes when no `Authorization` header is sent, so the Anthropic SDK's `apiKey` option works on versions before and after API version `2026-10-21` (older SDKs send it as `x-api-key`, newer ones as `Authorization: Bearer`).
