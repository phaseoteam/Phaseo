---
"@phaseo/web-api": patch
"@phaseo/web": patch
---

Model pages no longer show how many requests or attempts a model or provider served. Counts reveal a model's traffic volume, so the uptime and provider health tooltips and the provider card now show percentages only.

- Uptime tooltip: "0.6% of requests failed" or "No failures this hour", instead of "1 of 170 requests failed".
- Provider health and the provider card hover: "0.6% of attempts couldn't reach the provider", "1.5% of attempts that reached the provider were turned away because it was at capacity", "No failures", and so on, instead of "2 of 340 attempts…".
- Provider card error breakdown: rate-limited requests are shown as a share of the provider's requests, not a count.
- web-api stops publishing the counts added for these views. `/api/_web/models/:modelId/performance` drops `failedRequests`, `eligibleAttempts`, `reachabilityFailures`, `capacityFailures` and `callErrorFailures` from `successSeries`, and `providerPerformance[].attemptHealth` is now rates only. `/provider-health` `attempt_health` drops `attempts`, `eligible_attempts`, `success_attempts` and the three `*_failures` fields (per provider and per hour) and adds `days`, the same rates per UTC day, which the provider card uses for its daily uptime bars.
- Counts stay available internally: the SQL functions are unchanged.
