---
"@phaseo/gateway-api": patch
---

Match OpenAI, Azure, DeepInfra and Vertex request details to their docs:

- `service_tier: "standard"` now reaches OpenAI EU, Azure and DeepInfra as `default`, the name their APIs accept. Before, only the global OpenAI provider had this mapping.
- OpenAI models that support only the Responses API (gpt-5-pro, gpt-5.2/5.4/5.5-pro, o1-pro, o3-pro, gpt-5.3-codex) are called on `/v1/responses` for Chat Completions clients.
- Reasoning effort uses each model's documented levels: gpt-5.5 keeps `none` and `xhigh`, gpt-5.5-pro and gpt-5.2-pro take medium to xhigh, gpt-5-pro takes high only, and gpt-5.3-codex takes low to xhigh.
- Gemini 3.1 Flash-Lite on Vertex EU is called on the `eu` multi-region, the only EU location that serves it, and Vertex Gemini receives `seed`.
