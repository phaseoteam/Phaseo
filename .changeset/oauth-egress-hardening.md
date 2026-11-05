---
"@phaseo/gateway-api": patch
---

Sign-ins through the Phaseo CLI or desktop app no longer get an exemption on control routes that change where workspace content and events go or what can spend: those changes now return 403 and say to use the Phaseo dashboard or a management key. Apps that use Sign in with Phaseo, and CLI or desktop sign-ins, can no longer make a preset cache responses for longer, drop its zero data retention requirement or turn on web search or fetch, on create, update, publish, label, fork or upstream apply.
