---
"@phaseo/gateway-api": minor
"@phaseo/sdk": patch
---

Rate limit policies now enforce `concurrent_requests` (requests in progress at once, rejected with reason `policy_concurrent_requests`) and `fail_closed` (strict policies check their limits before sending a request and reject it with reason `policy_unavailable` when they cannot be checked).
