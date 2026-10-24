---
"@phaseo/gateway-api": patch
---

Amazon Bedrock: send GPT-5.x and Grok to Mantle's `/openai/v1` path, sign Mantle requests with the `bedrock-mantle` SigV4 service, translate Messages and Responses clients of chat-only models through Chat Completions, and serve cross-Region inference profile IDs (`global.`, `us.` and others) from bedrock-runtime, with InvokeModel and its event stream for Claude.
