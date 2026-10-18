---
"@phaseo/gateway-api": patch
---

Fix the streaming grammar on every surface. Chat streams now carry only `chat.completion.chunk` frames (the finish reason and the usage-only chunk replace the trailing `object: "chat.completion"` frame) and end with one `data: [DONE]`. Responses streams built from Claude and from Chat-dialect upstreams announce each item with `response.output_item.added` (and its text part) before its deltas, close text items with `output_text.done`, `content_part.done` and `output_item.done`, and end with `response.incomplete` when the response is incomplete. Streams re-encoded into another protocol keep that protocol's grammar: Messages clients get content blocks and a final `message_stop`, and frames of the other protocol are no longer forwarded raw.
