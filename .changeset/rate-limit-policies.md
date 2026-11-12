---
"@phaseo/cpp-sdk": minor
"@phaseo/csharp-sdk": minor
"@phaseo/gateway-api": minor
"@phaseo/go-sdk": minor
"@phaseo/java-sdk": minor
"@phaseo/php-sdk": minor
"@phaseo/py-sdk": minor
"@phaseo/ruby-sdk": minor
"@phaseo/rust-sdk": minor
"@phaseo/sdk": minor
"@phaseo/cli": patch
"@phaseo/docs": patch
"@phaseo/web": patch
"@phaseo/web-api": patch
---

Add beta management endpoints for named rate limit policies (requests per minute, tokens per minute, concurrent requests) and their assignments to API keys, members, departments, guardrails, or the workspace's end-user default, with new `rate_limits:read`, `rate_limits:write`, and `rate_limits:delete` scopes. The gateway does not enforce these policies yet. API keys can now be linked to a department with `department_id`. The guardrail request and spend limit fields, which were never enforced, are marked deprecated.
