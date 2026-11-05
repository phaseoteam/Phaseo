---
"@phaseo/gateway-api": patch
---

Sign-ins through the Phaseo CLI or desktop app no longer get an exemption on control routes that change where workspace content and events go or what can spend: those changes now return 403 and say to use the Phaseo dashboard or a management key. Apps that use Sign in with Phaseo, and CLI or desktop sign-ins, can no longer make a preset cache responses for longer, drop its zero data retention requirement or turn on web search or fetch, on create, update, publish, label, fork or upstream apply.

API key responses from the management API (list, get, create, update, rotate, cache invalidation and the current-key route) no longer include the key's `hash` or `kid`. Keys are identified by `id`; a hash saved from an older response is still accepted in the path.
