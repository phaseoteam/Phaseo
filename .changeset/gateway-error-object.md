---
"@phaseo/gateway-api": patch
"@phaseo/web": patch
---

Error responses now return `error` as an object with `code`, `message` and `type` (plus `param` when the gateway knows which request field failed, and `metadata` with structured detail such as the failing provider, the reason or `retry_after_seconds`), so OpenAI-compatible SDKs surface the gateway's message instead of a generic error. `type` follows OpenAI's documented error types and is set from the HTTP status: `invalid_request_error`, `authentication_error`, `insufficient_quota`, `permission_error`, `not_found_error`, `rate_limit_error`, `server_error`, `service_unavailable` (503) or `overloaded` (529). Every existing top-level field is still returned, and the code string that `error` used to hold is also returned as top-level `code`. `/v1/messages` errors use the same body, and Chat Completions mid-stream `error` frames carry the same object. The web playground and request logs read both shapes.
