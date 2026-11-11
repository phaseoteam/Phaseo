---
"@phaseo/gateway-api": patch
---

Claude Fable 5.2 and Claude Mythos 5.2 requests that force a tool call (`tool_choice` `any` or `tool`) now get a clear 400 from the gateway, as Fable and Mythos 5.1 requests already did, instead of an upstream provider error.
