---
"@phaseo/gateway-api": patch
---

Fix the streaming grammar on every surface. Chat streams now carry only `chat.completion.chunk` frames (the finish reason and the usage-only chunk replace the trailing `object: "chat.completion"` frame) and end with one `data: [DONE]`. Responses streams built from Claude and from Chat-dialect upstreams start with a `response.created` snapshot (`object`, `status` and an empty `output`), announce each item with `response.output_item.added` (and its content part) before its deltas, close every message and reasoning item with its done events, and end with `response.incomplete` when the response is incomplete. Streams re-encoded into another protocol keep that protocol's grammar: Messages clients get content blocks, usage in Messages terms and a final `message_stop`; Responses clients get content parts, done events and the assembled `output` on the terminal response; frames of the other protocol are no longer forwarded raw.
