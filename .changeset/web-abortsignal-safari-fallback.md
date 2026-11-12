---
"@phaseo/web": patch
---

Public data requests no longer crash on older iOS Safari that lacks `AbortSignal.any` or `AbortSignal.timeout`; a small fallback keeps the request timeout and caller cancellation.
