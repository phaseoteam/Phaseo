---
"@phaseo/web-api": minor
"@phaseo/web": minor
"@phaseo/gateway-api": patch
"@phaseo/docs": patch
---

Providers declare the request and token limits they impose on Phaseo, provider-wide or per upstream model, through an optional `rate_limits` section in their catalogue feed or the new Rate limits section in provider settings. Limits apply without review once the provider is approved, and the gateway picks up changes as soon as the catalogue revision moves instead of waiting for its configuration TTL.
