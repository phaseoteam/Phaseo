---
"@phaseo/gateway-api": patch
---

Remove unread Anthropic accounting stream copies, preserve native Messages events, bound Responses translation and nonstream accumulation, and reject truncated or malformed completions without losing cache-token billing meters.
