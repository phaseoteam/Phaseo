---
"@phaseo/py-sdk": patch
---

Streamed Responses text now arrives once. A chunk's `text` comes only from delta events, so `response.output_text.done` and `response.completed` no longer repeat the answer; the done event's full text is on `full_text`. SSE `event:` lines name the next event (as `type` when its data has none) and, like `id:`, `retry:` and comment lines, are no longer yielded as `raw` chunks, in both `Phaseo` and `AsyncPhaseo`. `User-Agent` and `X-Phaseo-Client-Version` now report the installed package version (they were stuck at 2.0.7); the version is available as `phaseo.__version__`.
