---
"@phaseo/gateway-api": patch
---

Use bounded, pull-driven SSE framing for OpenAI-compatible Chat streams, preserve CRLF/multiline events, and propagate malformed frames, transport errors and missing terminal markers.
