---
"@phaseo/gateway-api": patch
"@phaseo/web-api": patch
"@phaseo/web": patch
---

Rotating an API key now copies everything attached to it to the new key in one step: limits and key settings (including never-store-content and the department), guardrails of every kind, observability destinations, the dynamic route and key spend rules. Before, only some of these were copied, so a rotated key could run without its guardrails. The old key keeps its own settings until it expires, and the rotate dialog lists what was copied.
