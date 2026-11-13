---
"@phaseo/gateway-api": patch
---

Reasoning sent back by clients now reaches every mainstream provider in the form it needs. Fixes 400s on Gemini 3.1 Flash-Lite (AI Studio) follow-ups, Together gpt-oss parallel tool calls and Groq streamed Chat; reasoning is no longer dropped for Groq, Fireworks, Cerebras, DeepSeek, Xiaomi MiMo, Alibaba Cloud and Azure Chat; OpenAI, Azure and xAI reasoning keeps its place after a preamble message.
