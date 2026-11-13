---
"@phaseo/gateway-api": patch
---

Count management API requests against a weighted per-credential budget of 600 units a minute, in shadow mode. Each request draws 1 to 10 units by how hard it works the database: catalogue and self reads 1, workspace lists 2, writes 3, log, generation and audit searches 5, analytics and test calls to outside services 10. Health checks, CORS preflights and internal calls are free. Shadow mode only logs requests that would have been refused; `CONTROL_API_RATE_LIMIT_MODE = "enforce"` will return 429 `rate_limit_exceeded` with `Retry-After`. The gateway now builds with Wrangler 4.158 and `@cloudflare/workers-types` 5.20261106.1, which add the rate limiter's `delta` option.
