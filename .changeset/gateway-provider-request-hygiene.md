---
"@phaseo/gateway-api": patch
---

Send provider requests in the shape each provider documents. Responses requests to SambaNova, Scaleway, Ambient, Baidu and Alibaba now carry the conversation in `input` (not `input_items`), with flat function tools for SambaNova, Scaleway and Ambient. The gateway no longer adds fields the client did not send: `parallel_tool_calls`, `logprobs: false`, `safety_identifier: null`, `store` on OpenAI Chat Completions, Claude adaptive thinking without reasoning settings, and `stream_options` to Mistral and Together, whose APIs do not define it. Array tool results reach providers as content parts where their API takes them and as the joined text elsewhere, instead of a JSON string of the array; Claude receives text and image tool result blocks and `is_error`. Message `name` reaches providers whose chat API defines it.
