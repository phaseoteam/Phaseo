---
"@phaseo/gateway-api": minor
---

Rank providers for default (`balanced`) text requests by expected cost per successful answer. The cost combines the effective price of a typical request (from the model's measured prompt and output sizes and each provider's measured cache-hit rate) with priced waiting time to the first token and the full response, divided by the provider's recent success rate, with extra penalties for provider errors and rate limits. Providers near the lowest cost share traffic, and every provider keeps a small share. Explicit sorts, provider order and non-text endpoints are unchanged. `GATEWAY_ROUTING_ALGORITHM` can pin the previous algorithm (`v8`) or alternate the two in 3-hour blocks (`switchback`).
