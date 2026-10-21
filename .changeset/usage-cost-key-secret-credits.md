---
"@phaseo/gateway-api": patch
---

Report each request's cost in US dollars as `usage.cost` on Chat Completions, Responses, Messages and embeddings responses, alongside the existing `usage.pricing` / `pricing_breakdown` and `cost_nanos`. Buffered responses report the settled charge. Streams add it to the final usage frame as the charge for the whole stream, after any data-sharing discount or zero-output waiver, and leave it out on a stream that has already failed, which is not charged. `usage.cost_details.upstream_inference_cost` gives the provider's cost on your own key for BYOK requests and is null otherwise. On a BYOK stream the frame's price appears there in place of `cost`, because the service fee is worked out when the stream ends.

`POST /v1/keys` also returns the new secret as a top-level `key`, the same value as `data.key`.

`GET /v1/credits` now sums `thirty_day_usage` in the database, so workspaces with more than 1,000 ledger entries in 30 days get the full total. The value means the same as before.
