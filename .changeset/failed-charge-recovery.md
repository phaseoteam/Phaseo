---
"@phaseo/gateway-api": patch
---

Add disabled-by-default durable recovery for exhausted usage-charge retries with bounded replay attempts, database idempotency, and confirmed dead-letter transfer. Successful charges add no queue operation.
