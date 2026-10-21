---
"@phaseo/gateway-api": patch
---

Improve reasoning, streaming and citation handling across the text endpoints:

- Chat Completions returns reasoning text as `message.reasoning` and `delta.reasoning` as well as `reasoning_content`.
- Every Responses stream event carries `type`, matching its SSE event name, and a `sequence_number`. Streams now send `response.in_progress` after `response.created`, and send `response.reasoning_text.done` and `response.content_part.done` for every part that streamed deltas. Reasoning summary deltas are named `response.reasoning_summary_text.delta` in both places, and Gemini reasoning streams use `response.reasoning_text.delta`.
- Reasoning items in Responses output put their text in `reasoning_text` content parts.
- Responses `reasoning` input items may carry a raw `signature` with a `format` (for example `anthropic-claude-v1` or `google-gemini-v1`), so Claude thinking and Gemini thought signatures reach the provider on the next turn.
- Gemini Chat streams number `reasoning_details` entries across the whole stream instead of restarting at 0 in each chunk.
- OpenAI Chat requests whose history carries OpenAI encrypted reasoning are served through the Responses API, so the reasoning continues even when the request does not set `reasoning` again.
- Claude citations reach `/v1/messages` clients unchanged, as text block `citations` and `citations_delta` events.
- `tool_choice: {type: "allowed_tools"}` maps to its mode (or the one allowed tool) on providers other than OpenAI, instead of forcing a tool named `allowed_tools`, and those providers are sent only the allowed tools, so the model cannot call one the request excluded. OpenAI still receives the original choice and every tool. If `allowed_tools` lists a tool that `tools` does not define, only OpenAI serves the request; with no OpenAI route it returns a 400 `validation_error`.
- A Chat custom tool choice, `{type: "custom", custom: {name}}`, forces that custom tool instead of a tool named `custom`.
- Audio and video content sent to a Claude model returns a 400 `unsupported_content_type` error instead of reaching the model as placeholder text.
