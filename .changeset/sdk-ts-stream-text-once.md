---
"@phaseo/sdk": patch
---

Streamed Responses text now arrives once. A chunk's `text` comes only from delta events, so `response.output_text.done` and `response.completed` no longer repeat the answer; the done event's full text is on `fullText`. SSE `event:`, `id:`, `retry:` and comment lines are no longer yielded as `{ raw: "event: …" }` chunks. `X-Phaseo-Client-Version` now reports the installed package version (it was stuck at 2.2.0); the version is exported as `SDK_VERSION`.
