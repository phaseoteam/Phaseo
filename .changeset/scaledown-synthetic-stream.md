---
"@phaseo/gateway-api": patch
---

ScaleDown Summarize and Extract now work through the text endpoints. ScaleDown does not stream, so the gateway makes one non-streaming call and replays the complete result as a stream, instead of rejecting every request as a streaming request.
