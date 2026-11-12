---
"@phaseo/gateway-api": patch
---

Report provider failures that happen after a text stream has started. Streaming clients now receive the endpoint's failure event (an `error` frame on Chat Completions, `response.failed` on Responses, an `error` event on Messages) instead of a normal finish, on every provider dialect. Non-streaming requests return `502 upstream_stream_failure` instead of `200` with partial text, are recorded as failures, and are not charged, matching streamed requests.
