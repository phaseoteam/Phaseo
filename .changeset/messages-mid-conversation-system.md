---
"@phaseo/gateway-api": minor
"@phaseo/sdk": patch
"@phaseo/py-sdk": patch
"@phaseo/go-sdk": patch
"@phaseo/rust-sdk": patch
"@phaseo/java-sdk": patch
"@phaseo/csharp-sdk": patch
"@phaseo/cpp-sdk": patch
"@phaseo/php-sdk": patch
"@phaseo/ruby-sdk": patch
"@phaseo/docs": patch
---

`/v1/messages` accepts mid-conversation `role: "system"` messages, as in Anthropic's Messages API. A system message takes a string or text blocks and must come straight after a user turn (or an assistant turn ending in a server tool result) and be the last message or be followed by an assistant turn; other positions, and the beta-only `clear_at`, `output_config`, `tool_addition` and `tool_removal`, return a 400. Claude models that support these messages receive them in place, except on Microsoft Foundry; other Claude models, including Sonnet 5, and every Claude model on Microsoft Foundry receive them in the top-level system prompt, and other providers receive them as a system message. The SDKs gain an `AnthropicSystemMessage` model with text-only content, and `AnthropicMessagesRequest.messages` takes either an `AnthropicMessage` or an `AnthropicSystemMessage`.
