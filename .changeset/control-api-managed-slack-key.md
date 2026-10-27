---
"@phaseo/gateway-api": patch
---

The control API no longer lists, reads, changes, rotates or deletes the Slack agent's managed key, as it already did for Chat's. Changing or deleting the Slack agent's locked guardrail now returns 409 `guardrail_protected` with a clear message, instead of a 500.
