---
"@phaseo/gateway-api": minor
"@phaseo/docs": patch
---

Add DeepSeek to web search. `phaseo:web_search` and `phaseo:web_fetch` take `engine: "deepseek"`, which runs DeepSeek Search and DeepSeek Fetch on any model, with domain lists sent as `site:` operators. DeepSeek V4.1 Flash now runs native web search itself: `engine: "native"`, or OpenAI's `web_search` tool, reaches DeepSeek as `deepseek_web_search` (deep multi-step search when reasoning is on), returns cited answers, and bills DeepSeek's searches and page fetches at $0.75 per 1,000 each. Requests DeepSeek's web tools can't serve (other tools in the request, or domain lists) use Phaseo's search instead.
