---
"@phaseo/gateway-api": patch
---

Count requests rejected by workspace rate limit policies per minute, policy, limit scope and API key, refreshed every five minutes and kept for 30 days. Exported traces of a rejected request carry `phaseo.rate_limit.policy_id` and `phaseo.rate_limit.scope`.
