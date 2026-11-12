---
"@phaseo/gateway-api": minor
"@phaseo/docs": patch
"@phaseo/sdk": patch
---

Enforce department assignments on workspace rate limit policies. A department policy is one allowance shared by everything that counts toward the department: keys linked to it, and otherwise the keys created by its members and their OAuth requests. An exhausted department allowance returns `429` `rate_limit_exceeded` with `limit_scope: "department"`.
