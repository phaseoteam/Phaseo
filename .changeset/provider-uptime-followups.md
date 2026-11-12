---
"@phaseo/gateway-api": patch
"@phaseo/web-api": patch
"@phaseo/web": patch
---

Provider health on model pages now says what each excluded failure was, counts Phaseo's own routing problems as Phaseo's, and reads as "Reachable", "Accepted" and "Completed".

- Every provider attempt now also stores why it got its class (`v2_request_attempts.health_reason`), for example `route_model_not_found`, `provider_rejected_request_accepted_elsewhere`, `rate_limited` or `client_cancelled`.
- A provider 4xx is Phaseo's (not the customer's) when another route then accepted the same request, and a provider that does not know the model on Phaseo's managed key is Phaseo's too. So is a provider refusing the location Phaseo called from. Neither counts against the provider or the customer. Older rows are classified the same way where the stored fields allow.
- The three rates are a funnel: reachable of eligible attempts, accepted of those that reached the provider, completed of those it accepted. Tooltips give the counts, for example "5 of 338 were turned away because the provider was at capacity". API fields are unchanged.
- A provider that drops a stream mid-way while the client is still connected now counts as a failure for the routing breaker. A client cancellation stays neutral.
- `get_v2_model_provider_attempt_health_reasons` gives the counts by reason for internal use; web-api does not publish them.
