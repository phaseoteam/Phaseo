---
"@phaseo/go-sdk": patch
---

Every Go SDK helper now sends its request with the `ctx` you pass, so cancelling the context or reaching its deadline stops the request. Before, most helpers ignored `ctx` and ran until the client timeout. The generated client gains `WithContext(ctx)` for the same behaviour on raw operations.
