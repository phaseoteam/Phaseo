---
"@phaseo/gateway-api": patch
"@phaseo/sdk": patch
"@phaseo/py-sdk": patch
---

Fix provider response parsing and request translation: Mistral reasoning chunk lists are read as reasoning and text, with ThinkChunk signatures kept and replayed to the same Mistral model, Nebius Token Factory Responses streams without `event:` lines are read, TypeSafe box answers may have null confidence, Baidu Qianfan requests from every surface use Chat Completions, Reflection assistant history always carries reasoning_content, Sail Research is no longer routed flex requests, and Alibaba Cloud glm-5.3 receives only the reasoning efforts it accepts. Decision box answers now type `confidence` as nullable.
