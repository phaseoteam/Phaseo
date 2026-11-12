---
"@phaseo/gateway-api": patch
---

Turn off Venice's own system prompt on chat requests unless the caller opts in with `include_venice_system_prompt`, so requests are no longer billed for about 1,525 extra input tokens.
