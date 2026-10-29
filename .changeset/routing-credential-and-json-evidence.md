---
"@phaseo/gateway-api": patch
---

Route JSON-mode and structured-output requests to routes that list `response_format` first, keeping the others as failover. Skip providers the gateway has no managed key for unless the request carries the customer's own key, and pause managed traffic to a provider for five minutes after its managed account returns 402.
