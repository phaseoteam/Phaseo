---
"@phaseo/gateway-api": patch
---

Return citations and refusals on every text surface, streamed and buffered. URL citations from OpenAI-compatible providers, Claude `citations` and Gemini grounding now reach Chat clients as `message.annotations` (`delta.annotations` when streaming) and Responses clients as `output_text` annotations and `response.output_text.annotation.added` events, each with the correct content index. Messages clients receive Claude's own citations as `citations` on text blocks; plain URL citations from other providers are left off Messages responses, which have no valid citation form for them. OpenAI refusals reach Chat as `refusal`, Responses as a refusal content part, and Messages as text. Buffered `/v1/responses` output from Chat-format providers now includes the model's reasoning text and keeps tool calls when a provider adds a partial message to its last chunk.
