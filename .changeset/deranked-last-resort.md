---
"@phaseo/gateway-api": minor
"@phaseo/sdk": minor
"@phaseo/py-sdk": minor
"@phaseo/go-sdk": minor
"@phaseo/web": patch
"@phaseo/web-api": patch
"@phaseo/slack-agent": patch
"@phaseo/mobile": patch
---

Deranking is now a single last-resort level. A deranked provider is tried only after every other healthy provider, ahead of providers at their quota limit and providers with an open breaker. The model catalogue reports it as `deranked`; `deranked_lvl1`, `deranked_lvl2` and `deranked_lvl3` are no longer returned, and filters that use them still match. Model pages, the models list and the admin editor show one "Lower priority" status.
