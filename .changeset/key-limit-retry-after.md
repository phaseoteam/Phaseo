---
"@phaseo/gateway-api": patch
"@phaseo/docs": patch
"@phaseo/web": patch
---

API key request and spend limits and workspace budgets now send `Retry-After` with their `429`, set to the seconds until the limit's window resets. Limits that never reset by themselves, such as lifetime budgets and soft-blocked keys, still omit it. The rate limits page now lists the requests-per-minute allowance for each workspace standing instead of a single 25 requests per minute.
