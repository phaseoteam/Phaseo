---
"@phaseo/gateway-api": minor
"@phaseo/docs": patch
---

Enforce the requests-per-minute limit of workspace rate limit policies assigned to API keys, members, guardrails and the end-user default. A rejected request returns `429` with the `rate_limit_exceeded` code, the policy ID and limit scope, and `Retry-After`; responses a policy applies to carry approximate `x-ratelimit-*-requests` headers. Policy changes are published to the gateway and take effect within about a minute, rotated keys keep their policy, and response cache hits are not counted. Tokens per minute, concurrent requests and department assignments are not enforced yet.
