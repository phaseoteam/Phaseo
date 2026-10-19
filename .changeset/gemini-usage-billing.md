---
"@phaseo/gateway-api": patch
---

Fix Gemini usage on Google AI Studio and Vertex. Thinking tokens (`thoughtsTokenCount`, `total_thought_tokens`) now count as output and tool-use prompt tokens (`toolUsePromptTokenCount`, `total_tool_use_tokens`) as input, so `completion_tokens` and `output_tokens` include reasoning, as on OpenAI. Image, audio and video prompt tokens are priced on their own meters when the route's card has them, and stay on the text meter otherwise. Gemini streams are billed from the upstream usage on every surface.
