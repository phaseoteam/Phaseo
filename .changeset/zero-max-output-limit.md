---
"@phaseo/gateway-api": patch
---

Treat a route's stored output-token limit of 0 as unknown rather than as a limit of zero tokens. Requests that set `max_tokens` (every `/v1/messages` request) are no longer rejected on such routes, `max_tokens` is no longer clamped to it, and Claude requests without `max_tokens` fall back to the default instead of sending 0.
