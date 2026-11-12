---
"@phaseo/gateway-api": patch
---

Keep input and cache token counts on `/v1/messages` requests to Claude Opus 5.5 on Amazon Bedrock and Google Vertex that are buffered or use gateway server tools. Those routes pass Anthropic's own stream through. That stream reports input and cache counts on `message_start` and the output on `message_delta`, and the gateway kept only the last usage event, so input, cache reads and cache writes were billed and reported as 0. Messages stream usage events are now merged: a count an event omits is kept, and a later count replaces an earlier one, except that a 0 for an input or cache count on `message_delta` does not erase the count `message_start` reported. Claude stream accounting follows the same rule. Streams in every other protocol still take the latest usage event whole, so a final usage that corrects a count to 0 is billed at 0.
