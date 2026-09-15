---
"@phaseo/gateway-api": patch
"@phaseo/web": patch
---

Add independent Batch and Video webhook event subscriptions, enforce supported event names, prevent cross-job-type fallback delivery, and emit distinct batch expired, status-change, and progress events.
