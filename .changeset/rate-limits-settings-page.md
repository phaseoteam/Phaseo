---
"@phaseo/web": minor
"@phaseo/web-api": minor
"@phaseo/gateway-api": patch
---

Add Settings → Rate limits (beta). Owners and admins can create rate limit policies with requests and tokens per minute, assign them to API keys, members, departments, guardrails or the end-user default, and see how many requests each policy throttled in the last 24 hours. Saves go through the gateway's `/v1/rate-limits` routes, which now also accept the dashboard session, so changes are validated, audited and enforced within about a minute.
