---
"@phaseo/gateway-api": patch
---

Limit the management API with a weighted per-credential budget of 600 units a minute. Each request draws 1 to 10 units by how hard it works the database: catalogue and self reads 1, other reads 2, writes 3, log, generation and audit searches 5, analytics and test calls to outside services 10. Health checks, CORS preflights and internal calls are free. A request over budget returns 429 `rate_limit_exceeded` with reason `management_api_rate_limit` and `Retry-After: 60`; if the limiter is unavailable, requests are allowed. Model, file, batch and job endpoints are unaffected. The gateway now builds with Wrangler 4.158 and `@cloudflare/workers-types` 5.20261106.1, which add the rate limiter's `delta` option.
