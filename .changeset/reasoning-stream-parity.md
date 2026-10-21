---
"@phaseo/gateway-api": patch
---

Improve reasoning, streaming and citation handling across the text endpoints.

**Behaviour changes.** Responses output now follows OpenAI's Responses format for reasoning, which changes what some clients receive:

- Reasoning items in Responses output put their text in `reasoning_text` content parts, which have no `annotations`. They used to be `output_text` parts. Message items still use `output_text`.
- In Responses streams, reasoning text deltas are `response.reasoning_text.delta` (some routes, Gemini's among them, used to send `response.reasoning.delta`), and reasoning summary deltas are `response.reasoning_summary_text.delta` on both the SSE event line and `data.type` (the event line used to read `response.reasoning_text.delta`).
- Audio and video content sent to a Claude model returns a 400 `unsupported_content_type` error. It used to reach the model as placeholder text.

Migration: inside a `reasoning` item, read the text of parts whose `type` is `reasoning_text` (accept `output_text` too if you also read stored responses from before this change); the text is still in `text`. Stream consumers should listen for `response.reasoning_text.delta` and `response.reasoning_summary_text.delta` and switch on `data.type`, which now always matches the event name. The SDKs gain a `ResponsesReasoningTextPart` type for these parts.

Other improvements:

- Chat Completions returns reasoning text as `message.reasoning` and `delta.reasoning` as well as `reasoning_content`.
- Every Responses stream event carries `type`, matching its SSE event name, and a `sequence_number`. Streams now send `response.in_progress` after `response.created`, and send `response.reasoning_text.done` and `response.content_part.done` for every part that streamed deltas.
- Responses `reasoning` input items may carry a raw `signature` with a `format` (for example `anthropic-claude-v1` or `google-gemini-v1`), so Claude thinking and Gemini thought signatures reach the provider on the next turn.
- Gemini Chat streams number `reasoning_details` entries across the whole stream instead of restarting at 0 in each chunk.
- OpenAI Chat requests whose history carries OpenAI encrypted reasoning are served through the Responses API, so the reasoning continues even when the request does not set `reasoning` again.
- Claude citations reach `/v1/messages` clients unchanged, as text block `citations` and `citations_delta` events.
- `tool_choice: {type: "allowed_tools"}` maps to its mode (or the one allowed tool) on providers other than OpenAI, instead of forcing a tool named `allowed_tools`, and those providers are sent only the allowed tools, so the model cannot call one the request excluded. OpenAI still receives the original choice and every tool. If `allowed_tools` lists a tool that `tools` does not define, only OpenAI serves the request; with no OpenAI route it returns a 400 `validation_error`.
- A Chat custom tool choice, `{type: "custom", custom: {name}}`, forces that custom tool instead of a tool named `custom`.
