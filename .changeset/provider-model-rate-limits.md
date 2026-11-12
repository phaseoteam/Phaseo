---
"@phaseo/gateway-api": patch
---

Support upstream provider limits (requests and tokens per minute and per day) per provider and model as well as provider-wide, configured in `provider_rate_limits` and counted globally across all users. Charges never delay a request; a provider and model that reaches a limit is heavily deranked in routing until its window resets instead of being skipped.
