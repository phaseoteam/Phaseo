---
"@phaseo/gateway-api": patch
"@phaseo/web-api": patch
"@phaseo/web": patch
---

When a workspace keeps I/O logs and zero data retention keeps a request's content out, the request log now says "Skipped: zero data retention is required" instead of a generic "no retained payload". This covers every source of ZDR: the workspace setting, a key guardrail, and the request itself, its preset or its routing. The gateway records the skip without any content, and the request sheet shows it in the reader's language. A key whose policy couldn't be read keeps its content out as before but doesn't claim ZDR as the reason.
