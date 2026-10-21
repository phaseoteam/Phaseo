---
"@phaseo/gateway-api": patch
---

Fix finish reasons across Chat, Responses and Messages. Buffered `/v1/messages` responses keep the provider's `stop_reason` (`max_tokens`, `stop_sequence` with its `stop_sequence`, `pause_turn`, `refusal`, `tool_use`) instead of always reporting `end_turn`; a content filter reaches Chat as `content_filter`, Responses as `status: "incomplete"` with `incomplete_details.reason: "content_filter"`, and Messages as `refusal`; buffered Responses `incomplete` results now include `incomplete_details`. Responses-dialect upstreams that end with `response.incomplete` now give Chat and Messages clients their final finish reason and usage, so length- and filter-truncated answers are recorded with their usage.
