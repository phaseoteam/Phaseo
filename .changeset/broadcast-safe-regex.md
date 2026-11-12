---
"@phaseo/gateway-api": patch
"@phaseo/web-api": patch
---

Broadcast "matches regex" rules now run on a linear-time matcher, so no pattern can stall the gateway on long prompts. Saving a rule rejects backreferences and lookahead/lookbehind, which that matcher can't run, with an error naming the problem.
