---
"@phaseo/gateway-api": patch
---

Keep input and cache token counts on `/v1/messages` requests to Claude Opus 5.5 on Amazon Bedrock and Google Vertex that are buffered or use gateway server tools. Those routes pass Anthropic's own stream through. That stream reports input and cache counts on `message_start` and the output on `message_delta`, and the gateway kept only the last usage event, so input, cache reads and cache writes were billed and reported as 0. Stream usage events are now merged: a later count replaces an earlier one unless it is missing, or is a 0 that would erase a count already reported. Claude stream accounting follows the same rule, so an upstream that repeats input tokens as 0 on `message_delta` no longer erases them.
