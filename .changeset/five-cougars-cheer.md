---
"@ai-stats/ai-sdk-provider": patch
---

Fix AI SDK provider chat request handling by:

- applying model-level defaults when call-level options are omitted
- passing through per-call provider options and request headers for chat requests
- supporting image content parts in chat prompt conversion
- removing stale duplicate v1 source copies from the package source tree
