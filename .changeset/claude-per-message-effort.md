---
"@phaseo/gateway-api": minor
---

Change Claude's reasoning effort mid-conversation without restarting the prompt cache. When a Chat Completions or Responses client changes `reasoning_effort` or `reasoning.effort` between requests, the gateway keeps the conversation's first level as the top-level effort and adds the change as a per-message effort marker (beta `mid-conversation-output-config-2026-07-01`). Each Claude reply ends with a sealed reasoning entry recording its level, which clients send back with the rest of the reasoning. Anthropic Messages accepts effort-only `system` messages (`content: []` with `output_config.effort`), forwarded on supported routes and folded into the top-level effort elsewhere.

Claude thinking blocks now go back to Claude in the order Claude wrote them on every surface. Chat Completions used to move thinking written between parallel tool calls, or after text, ahead of the text and tool calls; non-streamed Responses moved thinking written after text ahead of the text. Each thinking signature records everything before it, so the reordered blocks could fail Anthropic's preserved-thinking check (a 400 on enforced accounts) or miss the cache.
