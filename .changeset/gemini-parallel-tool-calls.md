---
"@phaseo/gateway-api": patch
---

Keep parallel Gemini function calls apart when they arrive in separate stream frames. Each call now gets its own tool-call `index` and keeps the `functionCall.id` Gemini sent, so streaming clients no longer merge two calls into one, and buffered Vertex Gemini responses return every call with its arguments.
