---
"@phaseo/agent-sdk": patch
---

Read each step's cost from the Phaseo gateway's price in usage (`pricing` on Chat Completions, `pricing_breakdown` on Responses), so streamed runs report their cost and `maxCost` stop conditions see it.
