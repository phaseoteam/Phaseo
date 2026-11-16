---
"@phaseo/web": patch
---

Stripe webhooks verify their signature asynchronously, so they work on Cloudflare Workers. Previously, every webhook was rejected with "SubtleCryptoProvider cannot be used in a synchronous context", which meant paid top-ups were never credited.
