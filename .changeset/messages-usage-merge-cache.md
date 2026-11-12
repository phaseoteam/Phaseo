---
"@phaseo/gateway-api": patch
---

Fix cache-read billing on non-streaming `/v1/messages` responses from providers that report OpenAI-style usage (for example Gemini and OpenAI). Cache reads and writes are now taken out of input once, so uncached input is billed in full.
