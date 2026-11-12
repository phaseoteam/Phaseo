---
"@phaseo/gateway-api": minor
"@phaseo/docs": patch
"@phaseo/sdk": patch
---

Enforce `tokens_per_minute` on workspace rate limit policies. Each request's input and output tokens are counted when it completes, over a rolling minute, for key, member, guardrail and end-user-default assignments. An exhausted allowance returns `429` `rate_limit_exceeded` with reason `policy_tokens_per_minute`, and responses carry `x-ratelimit-limit-tokens`, `x-ratelimit-remaining-tokens` and `x-ratelimit-reset-tokens`.
