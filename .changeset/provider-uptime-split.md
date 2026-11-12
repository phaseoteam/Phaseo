---
"@phaseo/gateway-api": patch
"@phaseo/web-api": patch
"@phaseo/web": patch
---

Model pages split provider uptime into three per-attempt metrics: reachability (could Phaseo get a response at all), capacity (did the provider take the call instead of turning it away for load) and call errors (did an accepted call finish without failing). Each provider attempt now counts against the provider it went to, even when the request failed over and succeeded elsewhere. Errors caused by the request, the customer's own key or limits, client cancellation and Phaseo itself are excluded.

- The gateway classifies every provider attempt and stores the class on `v2_request_attempts.health_class`. The routing breaker uses the same classifier. A stream that breaks after headers, or empty or invalid output, now marks the attempt that served it as a call error.
- A client that disconnects mid-stream is now recorded as a cancellation (`client:client_closed_request`, status 499) instead of an upstream stream failure (502).
- `/models/:id/provider-health` adds an `attempt_health` list next to `rows`. `/models/:id/performance` adds the three rates and their counts to `successSeries` and to `providerPerformance[].attemptHealth`. Existing fields are unchanged.
- The model page's uptime chart shows the three metrics, with the counts behind each rate in its tooltip. Provider cards base uptime on provider attempts and list the three rates.
