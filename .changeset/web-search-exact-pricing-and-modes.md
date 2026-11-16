---
"@phaseo/gateway-api": minor
"@phaseo/docs": patch
---

Managed web search is billed at what each engine charges Phaseo, and `phaseo:web_search` takes a `mode`.

- Exa, Parallel, Perplexity and DeepSeek searches and fetches are each charged at their provider's price instead of a flat $0.007 per search and $0.001 per fetch. Exa calls use the cost Exa reports for the call. Each charge is a pricing line with its `engine`, `mode` and `price_source`. Firecrawl keeps the flat rate for now.
- `mode` picks how the engine searches: Exa `lite`, `auto`, `deep-lite`, `deep`, and the research runs `agent-minimal` and `agent-low`; Parallel `turbo`, `fast`, `basic`, `advanced`, and the research runs `task-lite` and `task-base`; Perplexity `standard` and `fast`. A mode the engine doesn't have returns a 400.
- Research modes return an `answer` with the pages it cites. A run that hasn't finished after 120 seconds, fails, or loses its client returns an error and isn't charged.
