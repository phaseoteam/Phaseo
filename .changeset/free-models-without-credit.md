---
"@phaseo/gateway-api": patch
---

Let workspaces with no credit use free models again. A route is free when every price on its card is zero, whatever service tier the catalogue labels it with, so `:free` models and `phaseo/free` no longer return 402 `insufficient_funds` on a $0 wallet. Paid models, and models with any paid route, still need credit. `phaseo/free` now pools only routes that bill nothing, and every route admitted without credit counts against the daily free-model allowance. Workspace private models keep their current credit check.
