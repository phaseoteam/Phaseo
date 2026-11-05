---
"@phaseo/gateway-api": patch
---

Streamed responses now carry the same IDs as buffered ones. In a Responses stream, the `response` object in `response.created`, `response.in_progress`, `response.completed` and the other lifecycle events has the Phaseo request ID as `id` and the provider's response ID as `nativeResponseId`; in a Messages stream, `message_start` does the same for `message`. Before, a stream passed through from the provider showed the provider's ID (`resp_…`, `msg_…`) there instead. Output item IDs are unchanged. Chat Completions streams re-encoded from another protocol now report the provider's ID as `nativeResponseId` instead of repeating the request ID.
