---
"@phaseo/sdk": patch
---

`streamResponses` (and `responses.create` with `stream: true`) now gives a chunk the name on its SSE `event:` line as `type` when the event's data has no `type` of its own. Chunks whose data already has a `type` are unchanged.
