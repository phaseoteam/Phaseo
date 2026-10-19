---
"@phaseo/gateway-api": patch
---

End Gemini streams that a safety filter blocked with `finish_reason: "content_filter"` instead of an error. A candidate that finishes with `SAFETY`, `PROHIBITED_CONTENT` or another block reason and no content, and a prompt blocked through `promptFeedback.blockReason`, no longer count as a blank response, so streaming Chat clients get `content_filter` instead of `error`, and non-streaming Chat requests to Vertex Gemini return the filtered answer and are billed instead of failing.
