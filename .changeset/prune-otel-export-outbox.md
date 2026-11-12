---
"@phaseo/gateway-api": patch
---

Stop keeping Broadcast export payloads after they are no longer needed. Rows that are delivered or permanently fail now drop their prompt and completion payload straight away, and a scheduled prune removes delivered rows after a day and everything else after a week.
