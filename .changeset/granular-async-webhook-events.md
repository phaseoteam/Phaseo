---
"@phaseo/gateway-api": patch
"@phaseo/web": patch
---

Add independent Batch and Video webhook event subscriptions, enforce supported event names, prevent cross-job-type fallback delivery, emit distinct batch expired, status-change, and progress events, and support signed one-shot test deliveries for saved endpoints.
