---
name: phaseo-web-search-tools
description: Configure and debug Phaseo web search and grounding workflows. Use when a repository needs `gateway:web_search`, `gateway:web_fetch`, native provider web search, citation verification, or request-log debugging for search-heavy flows.
---

# Phaseo Web Search Tools

Use this skill when the work is specifically about search, source grounding, or fetched-page context rather than generic gateway wiring.

## Workflow
1. Identify the search mode:
- native provider web search
- `gateway:web_search`
- `gateway:web_fetch`
- mixed search plus follow-up fetch grounding

2. Choose the lowest-complexity path:
- prefer native provider web search when the chosen provider already supports it and the request surface can pass it through
- use `gateway:web_search` when you need provider-agnostic search behavior
- add `gateway:web_fetch` only when one or more concrete URLs must be grounded into page text

3. Keep the request contract explicit:
- native provider search should still route through `web_search_options` capability support
- `gateway:web_search` should declare bounded result count and only include full text when needed
- `gateway:web_fetch` should keep `max_chars` tight to control latency and token volume

4. Validate through logs before finishing:
- confirm request detail views show web-search observability
- confirm native search calls, managed search results, citations, or fetch metadata appear where expected
- verify usage counters such as `server_tool_use.web_search_requests` and `server_tool_use.web_fetch_requests`

## Practical rules
- Treat search and fetch as separate cost/latency decisions.
- Prefer highlights/snippets over full page text until the workflow proves it needs more.
- When debugging provider-native search, inspect both the request surface schema and capability filtering before changing model/provider choices.
- When grounding fetched content, check truncation flags before assuming the model saw the full page.

## Use this skill for
- coding-agent implementations that need search-backed answers
- request-log debugging for missing citations or search results
- comparing native provider search against gateway-managed search
- grounding workflows that chain search into fetched-page extraction
