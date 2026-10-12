---
"@phaseo/gateway-api": minor
---

Cache streamed text requests. A streamed request is stored only when its stream finishes cleanly, and a hit replays the stream as server-sent events with a new request ID, current timestamps and zero usage. Streamed and buffered requests are cached separately.
