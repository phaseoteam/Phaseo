---
"@phaseo/gateway-api": patch
---

Keep reasoning state on non-streaming responses. Buffered Chat, Messages and Responses replies now return the same thinking signatures, redacted thinking, encrypted reasoning and Gemini function-call signatures that streamed replies already carried, so a non-streaming tool loop with Claude or Gemini thinking can send them back on the next step.
