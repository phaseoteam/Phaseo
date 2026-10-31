---
"@phaseo/gateway-api": patch
"@phaseo/ai-sdk-provider": patch
---

Streaming Chat Completions requests to OpenAI models that set `reasoning_effort` and `stream_options.include_usage` (as the OpenAI SDK and the AI SDK do) no longer fail with HTTP 400 `unknown_parameter`. The AI SDK provider no longer sends `tool_choice` on requests without tools, which OpenAI models rejected with HTTP 400; this fixes plain `generateText` calls and agent frameworks that make tool-less calls, such as context compaction.
