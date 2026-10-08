---
"@phaseo/gateway-api": minor
---

Reduce gateway latency, database load and Cloudflare cost. Model catalogue data is always served from cache (isolate memory, Workers Cache, KV) and revalidated in the background against the published catalogue revision, with scheduled price and route changes switching exactly on time. Per-request bookkeeping writes, Statsig calls and uncached lookups are removed or throttled, failure audits no longer delay error responses, and workspace changes made outside the gateway invalidate cached contexts through the existing publication outbox. Fix streamed Responses-to-chat tool-call arguments being re-sent cumulatively and background work attaching to the wrong concurrent request.
